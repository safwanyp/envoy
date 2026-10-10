export function createDb() {
  return {
    users: [],
    todos: [],
    nextUserId: 1,
    nextTodoId: 1,
  };
}

export function getUser(db, email) {
  return db.users.find((user) => user.email === email) ?? null;
}

export function insertUser(db, email, password) {
  const user = { id: db.nextUserId, email, password };
  db.nextUserId += 1;
  db.users.push(user);
  return user;
}

export function listTodoRows(db) {
  return db.todos.slice();
}

export function insertTodo(db, title, userId) {
  const todo = { id: db.nextTodoId, title, userId };
  db.nextTodoId += 1;
  db.todos.push(todo);
  return todo;
}
