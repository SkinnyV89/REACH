-- Step 3: every account can buy; selling is added with a seller profile.
-- New neutral role value. Kept in its own migration because Postgres can't use
-- an enum value in the same transaction that adds it.
ALTER TYPE "UserRole" ADD VALUE 'MEMBER';
