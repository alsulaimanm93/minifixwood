import bcrypt, asyncio
from app.db import async_session
from sqlalchemy import text

email="admin@local"
pw="admin"

async def main():
    h = bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()
    async with async_session() as s:
        await s.execute(text("UPDATE users SET password_hash=:h WHERE email=:e"), {"h": h, "e": email})
        await s.commit()
    print("OK password reset for", email)

asyncio.run(main())
