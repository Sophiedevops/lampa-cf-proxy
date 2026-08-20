(function () {
    'use strict';

    if (window.cherry_proxy_plugin_loaded) return;
    window.cherry_proxy_plugin_loaded = true;

    var PROXY_DEFAULT = 'https://cherry-proxy.YOUR-SUBDOMAIN.workers.dev/proxy';
    var fallbackTimer = null;
    var checkVideoElInterval = null;

    function cherryProxyUrl() {
        return Lampa.Storage.get('cherry_v5_proxy_url', PROXY_DEFAULT);
    }

    window.cherryProxy = function(targetUrl) {
        var base = cherryProxyUrl().trim();
        if (!base.match(/\/proxy\/?$/)) base = base.replace(/\/$/, '') + '/proxy';

        if (targetUrl.indexOf('workers.dev') !== -1 || targetUrl.indexOf(base) !== -1) return targetUrl; 

        var key = Lampa.Storage.get('cherry_v5_proxy_key', '');
        var built = base + '?url=' + encodeURIComponent(targetUrl);
        if (key) built += '&key=' + encodeURIComponent(key);
        return built;
    };

    function checkToggle(name, default_value) {
        var val = Lampa.Storage.get(name, default_value);
        return val === true || val === 'true' || val === 1 || val === '1';
    }

    function getTrafficType(url, data) {
        if (!url) return 'unknown';
        var isLocalNetwork = /^(https?:\/\/)(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|127\.0\.0\.1|localhost)/.test(url);
        if (isLocalNetwork) return 'local';

        var currentTorrServerUrl = Lampa.Storage.get('torrserver_url', '');
        if (currentTorrServerUrl) {
            var cleanHost = currentTorrServerUrl.replace(/^https?:\/\//, '').split(':')[0];
            if (cleanHost && url.indexOf(cleanHost) !== -1) return 'direct_media'; 
        }
        
        var isTorrentMeta = data && (data.torrent || data.is_torrent || data.hash || data.method === 'torrent');
        var isTorrentPort = /:8090|:8091|:1090|:1190|:6878|:9090/.test(url);
        var isMagnetExt = /\.torrent$|^magnet:/.test(url);

        if (isTorrentMeta || isTorrentPort || isMagnetExt) return 'direct_media';

        return 'video_or_api';
    }

    function registerProxySettings() {
        Lampa.SettingsApi.addParam({
            component: 'player',
            param: { name: 'cherry_v5_global_enable', type: 'select', values: { 'true': 'Включено', 'false': 'Отключено' }, default: 'false' },
            field: { name: '[Cherry] Тотальный прокси (Сеть)', description: 'Заворачивать поиск (осторожно, CORS)' },
            onChange: function (value) { Lampa.Storage.set('cherry_v5_global_enable', value); }
        });

        Lampa.SettingsApi.addParam({
            component: 'player',
            param: { name: 'cherry_v5_video_mode', type: 'select', values: { 'auto': 'Умный (3 ступени)', 'force': 'Всегда проксировать', 'off': 'Отключено' }, default: 'auto' },
            field: { name: '[Cherry] Режим видео-прокси', description: 'Умный режим проверяет прямое, затем Воркер, затем снова прямое.' },
            onChange: function (value) { Lampa.Storage.set('cherry_v5_video_mode', value); }
        });

        Lampa.SettingsApi.addParam({
            component: 'player',
            param: { name: 'cherry_v5_timeout', type: 'select', values: { '5000': '5 секунд', '10000': '10 секунд', '15000': '15 секунд', '25000': '25 секунд' }, default: '15000' },
            field: { name: '[Cherry] Таймаут 1-й ступени', description: 'Время ожидания прямой ссылки' },
            onChange: function (value) { Lampa.Storage.set('cherry_v5_timeout', value); }
        });

        Lampa.SettingsApi.addParam({
            component: 'player',
            param: { name: 'cherry_v5_torrent_enable', type: 'select', values: { 'true': 'Включено', 'false': 'Отключено' }, default: 'false' },
            field: { name: '[Cherry] Проксировать TorrServer', description: 'Не рекомендуется из-за лимитов Cloudflare' },
            onChange: function (value) { Lampa.Storage.set('cherry_v5_torrent_enable', value); }
        });

        Lampa.SettingsApi.addParam({
            component: 'player',
            param: { name: 'cherry_v5_ui_btn_url', type: 'button' },
            field: { name: '[Cherry] Настроить URL воркера', description: 'Текущий: ' + cherryProxyUrl() },
            onChange: function () {
                Lampa.Input.edit({ title: 'Укажите URL', value: cherryProxyUrl(), free: true, nosave: true }, function (new_value) {
                    Lampa.Storage.set('cherry_v5_proxy_url', new_value); Lampa.Noty.show('Адрес сохранен.');
                });
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'player',
            param: { name: 'cherry_v5_ui_btn_key', type: 'button' },
            field: { name: '[Cherry] Настроить Секретный Ключ', description: 'Текущий: ' + (Lampa.Storage.get('cherry_v5_proxy_key') ? 'Задан' : 'Пусто') },
            onChange: function () {
                Lampa.Input.edit({ title: 'Введите Ключ', value: Lampa.Storage.get('cherry_v5_proxy_key') || '', free: true, nosave: true }, function (new_value) {
                    Lampa.Storage.set('cherry_v5_proxy_key', new_value); Lampa.Noty.show('Ключ обновлен.');
                });
            }
        });
    }

    function hookPlayer() {
        if (window.cherry_player_hooked) return;
        window.cherry_player_hooked = true;

        var originalPlay = Lampa.Player.play;

        Lampa.Player.listener.follow('destroy', function () {
            if (fallbackTimer) clearTimeout(fallbackTimer);
            if (checkVideoElInterval) clearInterval(checkVideoElInterval);
        });

        Lampa.Player.play = function (data) {
            if (fallbackTimer) clearTimeout(fallbackTimer);
            if (checkVideoElInterval) clearInterval(checkVideoElInterval);

            var videoMode = Lampa.Storage.get('cherry_v5_video_mode', 'auto');
            var isTorrentEnabled = checkToggle('cherry_v5_torrent_enable', 'false');
            var timeoutMs = parseInt(Lampa.Storage.get('cherry_v5_timeout', '15000'));

            if (data && data.url && data.url.indexOf('http') === 0) {
                var targetUrl = data.url;
                var trafficType = getTrafficType(targetUrl, data);

                if (trafficType === 'direct_media') {
                    if (isTorrentEnabled) {
                        Lampa.Noty.show('Cherry: Проксируем Торрент');
                        data.url = window.cherryProxy(targetUrl);
                    } else {
                        console.log('Cherry: Торрент пущен напрямую.');
                    }
                } 
                else if (trafficType === 'video_or_api') {
                    
                    // СТУПЕНЬ 3: Капитуляция скрипта. Возвращаем оригинальную ссылку и больше не трогаем.
                    if (data._cherry_gave_up) {
                        console.log('Cherry: Режим Hands-off. Лампа предоставлена сама себе.');
                    } 
                    // СТУПЕНЬ 2: Воркер в деле. Ждем, справится он или упадет.
                    else if (data._cherry_proxied || targetUrl.indexOf('workers.dev') !== -1) {
                        console.log('Cherry: Поток идет через Воркер. Следим за стабильностью...');
                        
                        checkVideoElInterval = setInterval(function() {
                            var $video = $('video');
                            if ($video.length > 0) {
                                var vid = $video[0];
                                
                                // Если Воркер успешно отдал видео
                                if (vid.readyState >= 3 || vid.currentTime > 0) {
                                    console.log('Cherry: Воркер успешно тащит видео.');
                                    clearInterval(checkVideoElInterval);
                                    return;
                                }

                                // Если Воркер не справился (ошибка 503/403)
                                $video.on('error', function() {
                                    clearInterval(checkVideoElInterval);
                                    $video.off('error');
                                    console.log('Cherry: Воркер упал. Запуск 3-й ступени (Возврат оригинала).');
                                    Lampa.Noty.show('Cherry: Прокси не справился. Возвращаем оригинальную ссылку...');
                                    
                                    var revertData = $.extend(true, {}, data);
                                    revertData.url = revertData._cherry_original_url;
                                    if (revertData.file) revertData.file = revertData.url;
                                    if (typeof revertData.video === 'string') revertData.video = revertData.url;
                                    
                                    revertData._cherry_gave_up = true; // Ставим метку капитуляции
                                    originalPlay.call(Lampa.Player, revertData);
                                });
                            }
                        }, 500);
                    } 
                    // СТУПЕНЬ 1: Первый запуск. Ждем 15 секунд, не упадет ли прямой поток.
                    else if (videoMode === 'auto') {
                        console.log('Cherry Auto: Ступень 1. Ожидание ' + (timeoutMs/1000) + ' сек...');
                        var originalData = $.extend(true, {}, data); 
                        originalData._cherry_original_url = targetUrl; // Сохраняем исходник для Ступени 3

                        var triggerFallback = function(reason) {
                            if (originalData._cherry_proxied) return;
                            console.log('Cherry Auto: ' + reason + '. Запускаем Ступень 2 (Прокси)...');
                            Lampa.Noty.show('Cherry: Прямое подключение не удалось. Запускаем прокси...');
                            
                            originalData._cherry_proxied = true; 
                            originalData.url = window.cherryProxy(originalData.url);
                            if (originalData.file) originalData.file = originalData.url;
                            if (typeof originalData.video === 'string') originalData.video = originalData.url;
                            
                            originalPlay.call(Lampa.Player, originalData);
                        };

                        fallbackTimer = setTimeout(function() {
                            triggerFallback('Таймаут истек');
                        }, timeoutMs);

                        // Проверяем, не стартануло ли видео мгновенно
                        checkVideoElInterval = setInterval(function() {
                            var $video = $('video');
                            if ($video.length > 0) {
                                var vid = $video[0];
                                
                                // Активная проверка на быстрый старт (фикс состояния гонки)
                                if (vid.readyState >= 3 || vid.currentTime > 0) {
                                    console.log('Cherry Auto: Видео моментально пошло напрямую. Отменяем прокси.');
                                    if (fallbackTimer) clearTimeout(fallbackTimer);
                                    clearInterval(checkVideoElInterval);
                                    return;
                                }

                                $video.on('playing timeupdate loadeddata', function() {
                                    console.log('Cherry Auto: Сигнал воспроизведения получен. Отменяем прокси.');
                                    if (fallbackTimer) clearTimeout(fallbackTimer);
                                    clearInterval(checkVideoElInterval);
                                    $video.off('playing timeupdate loadeddata error');
                                });

                                // Если прямой путь блокируется сразу
                                $video.on('error', function() {
                                    if (fallbackTimer) clearTimeout(fallbackTimer);
                                    clearInterval(checkVideoElInterval);
                                    $video.off('playing timeupdate loadeddata error');
                                    triggerFallback('Мгновенная ошибка прямого подключения');
                                });
                            }
                        }, 200);
                        
                        setTimeout(function() { if (checkVideoElInterval) clearInterval(checkVideoElInterval); }, timeoutMs + 1000);
                    }
                    else if (videoMode === 'force') {
                        Lampa.Noty.show('Cherry: Заворачиваем видео (Force Mode)...');
                        data.url = window.cherryProxy(targetUrl);
                        if (data.file) data.file = data.url;
                        if (typeof data.video === 'string') data.video = data.url;
                    }
                }
            }
            
            originalPlay.call(Lampa.Player, data);
        };
    }

    function hookNetwork() {
        if (window.cherry_net_hooked) return;
        window.cherry_net_hooked = true;

        if (window.$ && $.ajaxPrefilter) {
            $.ajaxPrefilter(function(options) {
                if (!checkToggle('cherry_v5_global_enable', 'false')) return;
                var url = options.url || '';
                if (url.indexOf('http') !== 0 || url.indexOf('workers.dev') !== -1) return;
                if (getTrafficType(url, {}) !== 'video_or_api') return;
                options.url = window.cherryProxy(url);
            });
        }

        var originalFetch = window.fetch;
        window.fetch = function(resource, init) {
            if (checkToggle('cherry_v5_global_enable', 'false') && resource) {
                var url = typeof resource === 'string' ? resource : (resource instanceof Request ? resource.url : '');
                if (url && url.indexOf('http') === 0 && url.indexOf('workers.dev') === -1) {
                    if (getTrafficType(url, {}) === 'video_or_api') {
                        if (typeof resource === 'string') resource = window.cherryProxy(resource);
                        else if (resource instanceof Request) resource = new Request(window.cherryProxy(resource.url), resource);
                    }
                }
            }
            return originalFetch.apply(this, arguments);
        };
    }

    function initCherry() {
        registerProxySettings();
        hookPlayer();
        hookNetwork();
    }

    if (window.appready) initCherry();
    else if (window.Lampa && window.Lampa.Listener) Lampa.Listener.follow('app', function (e) { if (e.type == 'ready') initCherry(); });
})();