@echo off
call npm run build
call npx vite preview --open
