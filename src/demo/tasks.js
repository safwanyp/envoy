/** @type {import('../coordinator/types').DemoTask[]} */
export const DEMO_TASKS = [
  {
    "id": "t_rate_limit",
    "agent": "agent-1",
    "delayMs": 0,
    "prompt": "Add per-IP rate limiting to login",
    "intent": "Add per-IP rate limiting to login",
    "touches": ["src/routes/auth.js#validateLogin"]
  },
  {
    "id": "t_validate_login",
    "agent": "agent-2",
    "delayMs": 400,
    "prompt": "Add stricter input validation to login",
    "intent": "Add stricter input validation to login",
    "touches": ["src/routes/auth.js#validateLogin"]
  },
  {
    "id": "t_rename_email",
    "agent": "agent-3",
    "delayMs": 0,
    "prompt": "Rename user field `email` → `emailAddress` everywhere",
    "intent": "Rename user field email to emailAddress everywhere",
    "touches": ["src/lib/db.js#getUser", "src/lib/db.js#insertUser", "src/routes/users.js#getUserByEmail", "src/routes/auth.js#login", "src/routes/auth.js#signup"]
  },
  {
    "id": "t_health",
    "agent": "agent-4",
    "delayMs": 0,
    "prompt": "Add `GET /health`",
    "intent": "Add GET /health",
    "touches": ["src/server.js#health"]
  },
  {
    "id": "t_request_log",
    "agent": "agent-5",
    "delayMs": 200,
    "prompt": "Add request logging in `server.js`",
    "intent": "Add request logging in server.js",
    "touches": ["src/server.js#logRequest"]
  },
  {
    "id": "t_todos_page",
    "agent": "agent-6",
    "delayMs": 0,
    "prompt": "Add pagination to `GET /todos`",
    "intent": "Add pagination to GET /todos",
    "touches": ["src/routes/todos.js#listTodos"]
  }
];
