# بستان — إدارة رسوم المرافق

واجهة عربية RTL أولية لإدارة عمارة سكنية. تشمل لوحة الملخص المالي، جدول الشقق، كشف حساب الشقة، وتسجيل دفعة مع إنشاء حالة إيصال قابلة للطباعة.

## التشغيل

```bash
npm install
npm run dev
```

## قاعدة البيانات المحلية (Docker + PostgreSQL)

1. ثبّت Docker Desktop ثم افتحه.
2. أنشئ ملف البيئة المحلي: `cp .env.example .env`.
3. غيّر `POSTGRES_PASSWORD` و`DATABASE_URL` إلى كلمة المرور نفسها داخل `.env`.
4. ثبّت الحزم: `npm install`.
5. شغّل PostgreSQL: `npm run db:up`.
6. أنشئ جداول قاعدة البيانات: `npm run db:migrate -- --name init`.
7. (اختياري) افتح Prisma Studio لتصفح البيانات: `npm run db:studio`.

> يستخدم المشروع Prisma 7، لذا يوجد `prisma.config.ts` في جذر المشروع وهو المسؤول عن قراءة `DATABASE_URL` من `.env`.

لا ترفع ملف `.env` إلى Git. لإيقاف قاعدة البيانات استخدم `npm run db:down`. بيانات التطوير محفوظة في Docker volume باسم `bostan_postgres_data`.

## استيراد ملف Excel

بعد نجاح الترحيل، شغّل الواجهة وخادم الـ API معًا عبر `npm run dev:all` ثم افتح رابط Vite الظاهر في الطرفية. يوجد زر **استيراد Excel** أعلى الصفحة. يدعم المستورد القالب الذي يحتوي على صفحة `مجمع` وصفحات مرقمة لكل شقة، ويحفظ الشقق والملاك وأرقام الهاتف والأرصدة والدفعات والإيصالات الموجودة في الملف. لا يعيد تكرار الإيصالات عند استيراد الملف نفسه مرة أخرى.

## مسار الإنتاج المقترح

- **واجهة:** React + Vite (الواجهة الحالية)
- **خادم:** Node.js / NestJS أو Next.js Route Handlers
- **قاعدة بيانات:** PostgreSQL مع Prisma
- **مصادقة:** جلسات آمنة أو JWT، بنوعين فقط: `ADMIN` و`OWNER`
- **تصدير:** PDF عبر HTML print template للعربية، وExcel عبر ExcelJS

## نموذج البيانات المقترح

```text
User(id, role, email, phone, password_hash, owner_id?)
Building(id, name, address, floors, notes, collector_contact)
Apartment(id, building_id, number, floor, area_m2, current_owner_id)
Owner(id, full_name, national_id, email, address, resident_status)
OwnerContact(id, owner_id, type, value)                   // هاتف/واتساب/بريد
Ownership(id, apartment_id, owner_id, starts_on, ends_on) // سجل الملكية
FeeType(id, name, category, active)
FeeAssignment(id, fee_type_id, apartment_id, amount, due_date, period, notes)
Payment(id, apartment_id, owner_id, paid_on, total_amount, method, receipt_no, notes)
PaymentAllocation(id, payment_id, fee_assignment_id, amount)
Receipt(id, payment_id, receipt_no, issued_at, pdf_url)
ImportBatch(id, file_name, building_id, imported_at, status, error_log)
```

`Payment.owner_id` و`Ownership` يحفظان نسبة أي دفعة إلى المالك وقت الدفع حتى بعد بيع الشقة. ويظل `Apartment.current_owner_id` هو المالك المخوّل بعرض الشقة حاليًا.

## استيراد ملفات Excel

ينصح بمسار استيراد إداري يعرض معاينة قبل الحفظ: يقرأ صفحة **مجمع** لإنشاء الشقق والملكية الحالية، ثم يقرأ كل صفحة شقة لاستخراج الرسوم والدفعات، ويكتب النتائج ضمن `ImportBatch`. ينبغي الحفاظ على رقم الإيصال الأصلي وتاريخ الدفعة، وتسجيل الصفوف التي لا يمكن مطابقتها بدل تجاهلها.
