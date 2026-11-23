# مستندات API صنعت‌نگار

تمام مسیرها با پیشوند `/api` و نیازمند نشست معتبر (کوکی `sn_session` یا هدر `Authorization: Bearer <token>`) به جز `/api/health` و `/api/auth/*` هستند.

- `GET /api/health` — بررسی سلامت سرویس
- `GET /api/auth/session` — وضعیت نشست فعلی و `demoMode`
- `POST /api/auth/login` — ورود با `username` و `password`
- `POST /api/auth/demo-login` — ورود آزمایشی (فقط در `DEMO_MODE=true`)
- `POST /api/auth/register` — ثبت‌نام کاربر جدید
- `POST /api/auth/logout` — خروج
- `GET /api/projects` | `POST /api/projects` — فهرست و ایجاد پروژه/محصول
- `GET /api/projects/compare?ids=1,2` — ماتریس مقایسه محصولات
- `GET /api/projects/:id` | `PUT /api/projects/:id` | `DELETE /api/projects/:id` — جزئیات، ویرایش و حذف
- `GET /api/projects/:id/passport` — شناسنامه دیجیتال کامل محصول
- `GET /api/projects/:id/export` — خروجی JSON پرونده
- `POST /api/projects/:id/assistant` — پرسش و پاسخ مستند به مشخصات تأییدشده
- `GET /api/documents` | `POST /api/documents/upload` | `GET /api/documents/:id` | `DELETE /api/documents/:id`
- `GET /api/facts` | `PATCH /api/facts/:id/review` | `GET /api/facts/:id/history` | `DELETE /api/facts/:id`
- `GET /api/attributes` | `POST /api/attributes` — ویژگی‌های سفارشی
- `GET /api/conflicts?project_id=` | `POST /api/conflicts/:id/resolve`
- `GET /api/templates` | `GET /api/content?project_id=` | `POST /api/content/generate` | `POST /api/content/verify` | `PUT /api/content/:id` | `DELETE /api/content/:id`
- `GET /api/catalogs` | `POST /api/catalogs/generate` | `GET /api/catalogs/:id/download` | `DELETE /api/catalogs/:id`
- `GET /api/analytics` | `GET /api/activity` | `GET /api/search?q=`
- `GET /api/ai/settings` | `PUT /api/ai/settings/:taskType` | `POST /api/ai/test`
- `GET /api/backup` — دانلود پشتیبان SQLite
- `POST /api/demo/load` — بارگذاری سناریوی آزمایشی دمو
