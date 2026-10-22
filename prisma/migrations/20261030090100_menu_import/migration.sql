-- Step 4b: logging "add from a flyer" requests in ai_jobs (no images or text
-- are stored).
-- AlterEnum
ALTER TYPE "AIJobType" ADD VALUE 'MENU_IMPORT';

