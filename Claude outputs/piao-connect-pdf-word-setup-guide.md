# Updating PDF & Word Report Downloads — Piao Connect

This is for your friend, since he already has the **Piao Connect** repo cloned from GitHub. He's run `composer install` before, but the two packages that power the report downloads — `barryvdh/laravel-dompdf` (PDF) and `phpoffice/phpword` (Word) — aren't installed on his machine yet. He needs to pull the latest code (which is what adds them to `composer.json`) and then actually install them, plus a couple of environment checks.

---

## 1. Pull the latest changes

From the project folder, on the branch **`fixed/reports-and-analytics`**:

```
git checkout fixed/reports-and-analytics
git pull origin fixed/reports-and-analytics
```

(If he's working on a different branch, ask him to switch to `fixed/reports-and-analytics` first, or merge it into whatever branch he's using.)

This pulls in the updated files:
- `composer.json` (now lists `barryvdh/laravel-dompdf` and `phpoffice/phpword` as requirements)
- `app/Http/Controllers/ReportController.php`
- `resources/views/reports/export.blade.php`
- `resources/js/pages/staff/views/ReportsView.tsx`
- `public/logo-removebg-preview.jpg` (new file — the barangay seal, pre-converted so it always shows up in the PDF)

---

## 2. Install the two report-download packages

This is the step he hasn't done yet. From the project folder:

```
composer install
```

Since the `git pull` above updated `composer.json` to include `barryvdh/laravel-dompdf` and `phpoffice/phpword`, running `composer install` now will download both of them into his `vendor/` folder for the first time.

If for any reason that doesn't pick them up (e.g. he's on a different branch than `fixed/reports-and-analytics`), he can install them directly instead:

```
composer require barryvdh/laravel-dompdf
composer require phpoffice/phpword
```

---

## 3. Rebuild the frontend

One of the changed files (`ReportsView.tsx`) is frontend code, so it needs a rebuild to take effect:

```
npm install
npm run build
```

If he normally runs the app with `npm run dev` instead, he can just restart that — no separate build needed, Vite will pick up the change automatically.

---

## 4. Clear Laravel's cached views (recommended)

Since a Blade view (`export.blade.php`) changed, it's good practice to clear any cached compiled views so the new version is definitely what gets used:

```
php artisan view:clear
php artisan config:clear
```

---

## 5. Enable the GD extension in PHP (if not already on)

The PDF export embeds the barangay seal as an image. PHP's **GD extension** should be enabled for the best results.

**Check:**
```
php -m
```
Look for `gd` in the list.

**If missing:**

- **XAMPP:** Open `php.ini` (via XAMPP Control Panel → Apache → Config → PHP (php.ini)), find `;extension=gd`, remove the `;`, save, then restart Apache.
- **Laragon:** Tray icon → PHP → php.ini → same as above → restart Laragon.
- **Linux server:**
  ```
  sudo apt install php8.2-gd
  sudo systemctl restart apache2   # or php-fpm / nginx, depending on the stack
  ```

Recheck with `php -m | grep gd` afterward.

---

## 6. Test it

1. Start/restart the app.
2. Log in as staff → **Reports & Analytics**.
3. **Download as Word** → should open cleanly in Word, seal visible, page numbers at the bottom.
4. **Download as PDF** → should open cleanly, seal visible, page numbers at the bottom, no content cut across pages.

---

## 7. Troubleshooting

**"The PHP GD extension is required, but is not installed."**
→ GD isn't enabled. Go back to Step 5. (The PDF should still download fine without GD — it just skips the seal — so this error shouldn't happen anymore after the update, but flagging it in case he's on an older build.)

**"Could not download the report" / a generic error**
→ Check `storage/logs/laravel.log` — the real error is always there even when the on-screen message is generic.

**Word says the file "experienced an error" opening it**
→ Make sure he actually pulled the latest `ReportController.php` (Step 1) and ran `composer install` (Step 2) — this was a real bug in an older version that's since been fixed.

**Changes don't seem to show up at all**
→ Double-check he pulled the right branch (`fixed/reports-and-analytics`) and ran `composer install`, then re-run Steps 3 and 4 (frontend rebuild + cache clear) — a stale build or cached view is the usual culprit.

---

### Quick summary

```
git checkout fixed/reports-and-analytics
git pull origin fixed/reports-and-analytics
composer install
npm install && npm run build
php artisan view:clear && php artisan config:clear
php -m | grep gd     # enable it in php.ini if missing, then restart the server
```

Then test both download buttons on the Reports & Analytics page.
