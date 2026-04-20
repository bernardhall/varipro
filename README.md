# VariPro Mobile App

A professional quoting app for construction trades (electricians, plumbers, carpenters, general contractors). Built with React Native (Expo) + Node.js/Express + SQLite.

---

## Project Structure

```
varipro/
├── backend/                  # Node.js + Express + SQLite API
│   ├── src/
│   │   ├── index.js          # Express entry point
│   │   ├── db/database.js    # SQLite schema + connection
│   │   ├── middleware/auth.js # JWT auth middleware
│   │   └── routes/
│   │       ├── auth.js       # /auth/register, /auth/login, /auth/refresh
│   │       ├── quotes.js     # /quotes CRUD + photo upload
│   │       └── clientsUsers.js # /clients + /users CRUD
│   ├── data/                 # SQLite DB file (auto-created)
│   ├── uploads/              # Uploaded photos (auto-created)
│   └── package.json
│
└── frontend/                 # React Native (Expo)
    ├── App.js                # Root entry point
    ├── app.json              # Expo config
    ├── src/
    │   ├── screens/
    │   │   ├── LoginScreen.js
    │   │   ├── RegisterScreen.js
    │   │   ├── QuotesScreen.js
    │   │   ├── QuoteDetailScreen.js
    │   │   ├── NewQuoteScreen.js
    │   │   ├── ClientsScreen.js
    │   │   ├── UsersScreen.js
    │   │   └── SettingsScreen.js
    │   ├── components/UI.js  # Reusable components
    │   ├── navigation/Navigator.js
    │   ├── services/api.js   # Axios API layer
    │   ├── hooks/useAuth.js  # Auth context + SecureStore
    │   └── utils/theme.js    # Colors, spacing, typography
    └── package.json
```

---

## Prerequisites

- **Node.js** v18+ ([nodejs.org](https://nodejs.org))
- **npm** v9+
- **Expo CLI**: `npm install -g expo-cli`
- **Expo Go** app on your phone (iOS/Android) — OR an iOS/Android simulator

---

## Setup & Running

### 1. Backend

```bash
cd varipro/backend
npm install
npm run dev        # starts on http://localhost:3001
```

The SQLite database and uploads folder are created automatically on first run.

**Environment variables** (optional — defaults shown):
```
PORT=3001
JWT_SECRET=varipro-dev-secret-change-in-production
```

### 2. Frontend

```bash
cd varipro/frontend
npm install
npx expo start
```

Then:
- Press **`i`** for iOS simulator
- Press **`a`** for Android emulator
- Scan the **QR code** with Expo Go on your phone

### 3. Connecting Frontend to Backend

The API base URL is set in `frontend/src/services/api.js`:

```js
const BASE_URL = 'http://localhost:3001';
```

- **iOS Simulator**: `localhost` works fine
- **Android Emulator**: Change to `http://10.0.2.2:3001`
- **Physical device**: Change to your machine's local IP, e.g. `http://192.168.1.x:3001`

---

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/register` | ❌ | Create account + primary user |
| POST | `/auth/login` | ❌ | Login (password or PIN) |
| POST | `/auth/refresh` | ❌ | Refresh JWT token |
| POST | `/auth/password-reset` | ❌ | Request password reset |
| GET | `/quotes` | ✅ | List quotes (filter/search) |
| POST | `/quotes` | ✅ | Create quote |
| GET | `/quotes/:id` | ✅ | Get quote with all line items |
| PUT | `/quotes/:id` | ✅ | Update quote |
| DELETE | `/quotes/:id` | ✅ | Delete quote |
| POST | `/quotes/:id/photos` | ✅ | Upload photos (multipart) |
| GET | `/clients` | ✅ | List clients |
| POST | `/clients` | ✅ | Create client |
| PUT | `/clients/:id` | ✅ | Update client |
| DELETE | `/clients/:id` | ✅ | Delete client |
| GET | `/users` | ✅ Admin | List users in account |
| POST | `/users` | ✅ Admin | Add user to account |
| DELETE | `/users/:id` | ✅ Admin | Remove user |

---

## Workflows

### Registration (Workflow A)
1. Open app → tap "Create one"
2. Enter business/company name
3. Enter your personal details (name, login, email, password, PIN)
4. Optionally enable Face ID / fingerprint
5. Your **Account Number** is generated and displayed — save it!
6. Auto-logged in → Home screen

### Login (Workflow B)
1. Enter Account Number (e.g. `ELEC-7G92`)
2. Enter Login Name
3. Choose: Password / PIN / Face ID
4. On success → Home screen
5. After 3 failed attempts → 60-second lockout

### Create a Quote (Workflow C)
1. Quotes tab → tap **＋** FAB
2. **Step 1**: Enter job name, select or create client
3. **Step 2**: Add site photos (camera or gallery)
4. **Step 3**: Write work summary, add tasks + hours
5. **Step 4**: Add materials, equipment, sundry, higher costs
6. **Step 5**: Review totals → **Create Quote** or **Save as Draft**

---

## Features

| Feature | Status |
|---------|--------|
| Registration (3-step wizard) | ✅ |
| Login (password / PIN / biometric) | ✅ |
| Account Number auto-generation | ✅ |
| Multi-user per account | ✅ |
| Quote creation (5-step wizard) | ✅ |
| Site photos (camera + gallery) | ✅ |
| Work tasks with hours | ✅ |
| Materials / Equipment / Sundry / Higher Costs | ✅ |
| Real-time cost totals | ✅ |
| Quote status management | ✅ |
| Client address book | ✅ |
| Search & filter quotes | ✅ |
| JWT auth with auto-refresh | ✅ |
| Biometric login (Expo Local Auth) | ✅ |
| Secure token storage (Expo SecureStore) | ✅ |
| Admin-only user management | ✅ |
| SQLite persistence | ✅ |
| Photo upload to server | ✅ |

---

## Development Notes

- **Default hourly rate**: $75/hr (hardcoded for MVP — add to user profile settings to make configurable)
- **Biometric**: Full biometric bypass login requires storing a device-specific token on first setup; the current implementation uses Expo Local Authentication for the UI prompt
- **PDF generation**: Scaffolded in the spec but not yet implemented — add `react-native-html-to-pdf` or a server-side PDF endpoint
- **Offline support**: The backend is SQLite-based; for true offline-first, add `expo-sqlite` to the frontend and a sync queue
- **Production**: Change `JWT_SECRET` to a strong random value, use HTTPS, and deploy the backend to a server

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Mobile frontend | React Native (Expo SDK 50) |
| Navigation | React Navigation v6 |
| Auth storage | Expo SecureStore |
| Biometrics | Expo Local Authentication |
| Camera / Photos | Expo Image Picker |
| HTTP client | Axios |
| Backend | Node.js + Express |
| Database | SQLite via better-sqlite3 |
| Auth | JWT + bcrypt |
| File uploads | Multer |
