'use strict';

const USERS_URL = 'https://jsonplaceholder.typicode.com/users';
const POSTS_URL = 'https://jsonplaceholder.typicode.com/posts';

// DOM-элементы
const loadUsersBtn = document.getElementById('loadUsersBtn');
const searchInput = document.getElementById('searchInput');
const messageArea = document.getElementById('messageArea');
const usersList = document.getElementById('usersList');
const postsArea = document.getElementById('postsArea');

// Состояние 
// Храним исходный (полный) список пользователей в памяти.
// Это позволяет фильтровать поиском БЕЗ повторного HTTP-запроса
let allUsers = [];

// Вспомогательные функции
/**
 * Показывает сообщение в области статуса.
 * @param {string} text // текст сообщения;
 * @param {'info'|'success'|'error'} type// — тип (влияет на цвет через CSS-класс).
 *
 */
function showMessage(text, type = 'info') {
  messageArea.textContent = text;
  messageArea.className = `message-area ${type}`; // CSS сам покажет/скроет блок
}

function clearMessage() {
  messageArea.textContent = '';
  messageArea.className = 'message-area';
}

/**
 * Создаёт DOM-карточку одного пользователя.
 * @param {Object} user — объект из API { id, name, email, address: { city }, ... }
 * @returns {HTMLElement} готовая карточка <article class="user-card">
 */
function createUserCard(user) {
  // Корневой контейнер карточки.
  const card = document.createElement('article');
  card.className = 'user-card';

  // Блок с текстовой информацией (имя, email, город).
  const info = document.createElement('div');
  info.className = 'user-info';

  // Имя пользователя — заголовок карточки.
  const name = document.createElement('h3');
  name.textContent = user.name;

  // Email: подпись + значение.
  const email = document.createElement('p');
  const emailLabel = document.createElement('span');
  emailLabel.className = 'label';
  emailLabel.textContent = 'Email: ';
  email.appendChild(emailLabel);
  // Значение email вставляем через createTextNode —
  // это тоже безопасный (не-HTML) способ, альтернатива textContent.
  email.appendChild(document.createTextNode(user.email));

  // Город: подпись + значение.
  const city = document.createElement('p');
  const cityLabel = document.createElement('span');
  cityLabel.className = 'label';
  cityLabel.textContent = 'Город: ';
  city.appendChild(cityLabel);
  city.appendChild(document.createTextNode(user.address?.city ?? '—'));

  // Собираем текстовый блок.
  info.appendChild(name);
  info.appendChild(email);
  info.appendChild(city);

  // Кнопка «Показать публикации» для этого пользователя.
  const btn = document.createElement('button');
  btn.type = 'button'; 
  btn.className = 'btn-posts';
  btn.textContent = 'Показать публикации';
  btn.addEventListener('click', () => loadUserPosts(user));

  card.appendChild(info);
  card.appendChild(btn);

  return card;
}

/**
 * Отрисовывает переданный массив пользователей в контейнере #usersList.
 * @param {Array<Object>} users — массив пользователей (полный или отфильтрованный).
 */
function renderUsers(users) {
  usersList.replaceChildren();

  // Если после фильтрации ничего не осталось — показываем сообщение
  // «Пользователи не найдены» 
  if (users.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'no-results';
    empty.textContent = 'Пользователи не найдены';
    usersList.appendChild(empty);
    return;
  }

  // DocumentFragment — «невидимый» контейнер: собираем все карточки в памяти,
  // затем вставляем их в DOM одним действием.
  const fragment = document.createDocumentFragment();
  users.forEach((user) => fragment.appendChild(createUserCard(user)));
  usersList.appendChild(fragment);
}

// GET: загрузка пользователей

/**
 * Загружает список пользователей с сервера (GET /users).
 */
async function loadUsers() {
  // === Состояние «Загрузка…» ===
  loadUsersBtn.disabled = true;   // блокируем кнопку, чтобы не было дублей запросов
  searchInput.disabled = true;    // поиск по пустому списку бессмысленен
  usersList.replaceChildren();    // очищаем старый список
  // Сбрасываем область публикаций — старые посты другого пользователя неактуальны.
  postsArea.replaceChildren();
  postsArea.appendChild(
    createPlaceholder('Выберите пользователя и нажмите «Показать публикации».')
  );
  showMessage('Загрузка пользователей…', 'info');

  try {
    
    const response = await fetch(USERS_URL, {
      signal: AbortSignal.timeout(8000),
    });

    // ВАЖНО: fetch не бросает исключение на HTTP-ошибки (404, 500).
    // Поэтому проверяем response.ok вручную 
    if (!response.ok) {
      throw new Error(`Ошибка HTTP: ${response.status} ${response.statusText}`);
    }

    const users = await response.json();

    // Сохраняем полный список в состоянии — для последующей фильтрации.
    allUsers = users;

    applyFilter();

    searchInput.disabled = false; 
    showMessage(`Загружено пользователей: ${users.length}`, 'success');
  } catch (error) {
    allUsers = [];
    usersList.replaceChildren();

    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      showMessage(
        'Ошибка: сервер не отвечает (превышено время ожидания). Проверьте интернет и попробуйте снова.',
        'error'
      );
    } else {
      showMessage(`Не удалось загрузить пользователей: ${error.message}`, 'error');
    }
    // searchInput остаётся disabled — данных нет, искать нечего.
  } finally {
    // finally выполняется ВСЕГДА (и при успехе, и при ошибке) —
    // поэтому кнопка гарантированно снова активна, и пользователь
    // может повторить попытку 
    loadUsersBtn.disabled = false;
  }
}

// Поиск по имени (без HTTP-запроса)
/**
 * Фильтрует уже загруженный список пользователей по имени.
 */
function applyFilter() {
  // .trim() убирает случайные пробелы по краям, .toLowerCase() — регистр.
  const query = searchInput.value.trim().toLowerCase();

  // Пустой запрос — показываем всех.
  if (!query) {
    renderUsers(allUsers);
    return;
  }

  // Фильтруем массив в памяти.
  const filtered = allUsers.filter((user) =>
    user.name.toLowerCase().includes(query)
  );

  // renderUsers сам покажет «Пользователи не найдены», если filtered пуст.
  renderUsers(filtered);
}


// GET: публикации пользователя
/**
 * Загружает публикации выбранного пользователя (GET /posts?userId=ID).
 * @param {Object} user — пользователь, для которого нажали «Показать публикации».

 */
async function loadUserPosts(user) {
  // Отключаем все кнопки «Показать публикации», чтобы пользователь
  // не запустил параллельно несколько запросов и не перепутал вывод.
  setPostsButtonsDisabled(true);
  postsArea.replaceChildren();
  postsArea.appendChild(createPlaceholder('Загрузка публикаций…'));

  try {

    const url = `${POSTS_URL}?userId=${encodeURIComponent(user.id)}`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(8000),
    });

    // Та же проверка, что и для /users: fetch не падает сам на 404/500.
    if (!response.ok) {
      throw new Error(`Ошибка HTTP: ${response.status} ${response.statusText}`);
    }

    const posts = await response.json();

    postsArea.replaceChildren();

    // Заголовок области — чтобы было понятно, чьи это посты.
    const caption = document.createElement('h3');
    caption.textContent = `Публикации: ${user.name}`;
    caption.style.marginTop = '0';
    caption.style.color = '#1d3557';
    postsArea.appendChild(caption);


    if (!posts.length) {
      postsArea.appendChild(
        createPlaceholder('У этого пользователя нет публикаций.')
      );
      return;
    }

    // Берём ровно первые три публикации — slice(0, 3) не мутирует массив.
    const firstThree = posts.slice(0, 3);
    firstThree.forEach((post) => {
      // Карточка публикации.
      const card = document.createElement('article');
      card.className = 'post-card';

      // Заголовок поста.
      const title = document.createElement('h3');
      title.textContent = post.title;

      // Текст поста.
      const body = document.createElement('p');
      body.textContent = post.body;

      card.appendChild(title);
      card.appendChild(body);
      postsArea.appendChild(card);
    });
  } catch (error) {
    // При ошибке полностью заменяем содержимое области на сообщение.
    postsArea.replaceChildren();
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      postsArea.appendChild(
        createError('Ошибка: сервер не отвечает (превышено время ожидания).')
      );
    } else {
      postsArea.appendChild(
        createError(`Не удалось загрузить публикации: ${error.message}`)
      );
    }
  } finally {
    // Всегда возвращаем кнопки в рабочее состояние 
    setPostsButtonsDisabled(false);
  }
}

// Утилиты для области публикаций
/**
 * Создаёт <p class="placeholder"> с текстом-заглушкой.
 * Используется для «Выберите пользователя…» и «Загрузка публикаций…».
 */
function createPlaceholder(text) {
  const p = document.createElement('p');
  p.className = 'placeholder';
  p.textContent = text;
  return p;
}

/**
 * Создаёт <p class="error"> с текстом ошибки.
 * Отдельная функция — чтобы одинаково оформлять все ошибки области постов.
 */
function createError(text) {
  const p = document.createElement('p');
  p.className = 'error';
  p.textContent = text;
  return p;
}

/**
 * Включает/выключает ВСЕ кнопки «Показать публикации» в списке пользователей.
 * @param {boolean} disabled — true = заблокировать, false = разблокировать.
 */
function setPostsButtonsDisabled(disabled) {
  usersList.querySelectorAll('.btn-posts').forEach((btn) => {
    btn.disabled = disabled;
  });
}


// Обработчики событий

// Кнопка «Загрузить пользователей» → GET /users.
loadUsersBtn.addEventListener('click', loadUsers);
searchInput.addEventListener('input', applyFilter);