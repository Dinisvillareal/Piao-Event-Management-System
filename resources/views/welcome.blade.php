<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Barangay e-Membership</title>

    {{-- Apply the saved light/dark choice before the first paint, so a reload never flashes dark first. --}}
    <script>
        try {
            var m = document.cookie.match(/(?:^|;\s*)piao-theme=(light|dark)/);
            var t = m ? m[1] : localStorage.getItem('piao-theme');
            if (t === 'light') document.documentElement.setAttribute('data-theme', 'light');
        } catch (e) {}
    </script>

    @vite(['resources/css/app.css', 'resources/js/app.tsx'])
</head>
<body>
    <div id="app"></div>
</body>
</html>
