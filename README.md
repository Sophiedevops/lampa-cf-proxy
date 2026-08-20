# 🍒 Cherry Proxy Lite для Lampa

Это быстрый и бесплатный персональный прокси на базе Cloudflare Workers для обхода блокировок балансеров в приложении Lampa. 

Вам не нужен собственный сервер или хостинг — скрипт устанавливается в ваше бесплатное облако Cloudflare за 2 минуты, а пароль генерируется автоматически.

---

## 🛠 Шаг 1. Регистрация и получение ключей Cloudflare

Для установки нам потребуется бесплатный аккаунт Cloudflare и два ключа от него.

1. Зарегистрируйтесь на сайте [Cloudflare](https://dash.cloudflare.com/sign-up) (если у вас еще нет аккаунта).
2. На главном экране (Dashboard) прокрутите страницу немного вниз и скопируйте свой **Account ID** из правой колонки. Сохраните его.
3. Нажмите на иконку своего профиля в правом верхнем углу и выберите **My Profile**.
4. Слева в меню перейдите в раздел **API Tokens** (или перейдите по [этой ссылке](https://dash.cloudflare.com/profile/api-tokens)).
5. Нажмите синюю кнопку **Create Token**.
6. В списке шаблонов найдите **Edit Cloudflare Workers** и нажмите *Use template*.
7. Ничего не меняя, прокрутите вниз и нажмите **Continue to summary**, а затем **Create Token**.
8. **Обязательно скопируйте полученный API Token** (он начинается с `cfat_...`). Это ваш единственный шанс его скопировать!

---

## 🚀 Шаг 2. Установка прокси (Деплой)

Вам не нужно скачивать программы или настраивать код вручную. Установка происходит автоматически через командную строку вашей Windows.

1. Нажмите на клавиатуре `Win + R`, введите `cmd` и нажмите Enter (откроется черное окно командной строки).
2. Скопируйте команду ниже, вставьте её в командную строку (правой кнопкой мыши) и нажмите **Enter**:

   ```cmd
   cd %TEMP% && curl -sL "[https://raw.githubusercontent.com/Sophiedevops/lampa-cf-proxy/main/worker.js](https://raw.githubusercontent.com/Sophiedevops/lampa-cf-proxy/main/worker.js)" -o worker.js && curl -sL "[https://raw.githubusercontent.com/Sophiedevops/lampa-cf-proxy/main/install.bat](https://raw.githubusercontent.com/Sophiedevops/lampa-cf-proxy/main/install.bat)" -o install.bat && install.bat
