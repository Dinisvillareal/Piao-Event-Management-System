<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>PiaoConnect</title>
    <link rel="icon" href="{{ asset('logo-removebg-preview.png') }}" type="image/png">

    {{-- Apply the saved light/dark choice before the first paint, so a reload never flashes dark first. --}}
    <script>
        try {
            var m = document.cookie.match(/(?:^|;\s*)piao-theme=(light|dark)/);
            var t = m ? m[1] : localStorage.getItem('piao-theme');
            if (t === 'light') document.documentElement.setAttribute('data-theme', 'light');
        } catch (e) {}
    </script>

    @viteReactRefresh
    @vite(['resources/css/app.css', 'resources/js/app.tsx'])
</head>
<body>
    <div id="app"></div>
</body>
</html>
