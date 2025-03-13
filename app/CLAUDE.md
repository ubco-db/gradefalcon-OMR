# GradeFalcon Project Guidelines

## Essential Commands

### Frontend
- Start dev server: `npm start`
- Run all tests: `npm test`
- Run single test: `npm test -- -t 'test name'`
- Build for production: `npm run build`

### Backend
- Start server: `npm start`
- Start with watch: `npm run start-watch`
- Run all tests: `npm test`
- Run tests with watch: `npm run test-watch`
- Run single test: `npm test -- -t 'test name'`

## Code Style Guidelines
- React functional components with hooks
- Path aliases with "@/" prefix in imports
- Tailwind CSS for styling with utility-first approach
- Use shadcn/ui component patterns for consistency
- Component files: PascalCase (e.g., LoginButton.js)
- Utility functions: camelCase
- Error handling: try-catch for async operations
- Prefer async/await over Promise chains

## Project Structure
- Frontend: React 
- Backend: Node.js/Express
- Database: MySQL
- OMR: Python for optical mark recognition