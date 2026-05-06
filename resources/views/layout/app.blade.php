<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Piao Event Management System</title>
    <style>
        :root {
            --primary: #2563eb;
            --primary-dark: #1d4ed8;
            --background: #f3f4f6;
            --card-bg: #ffffff;
            --text-main: #1f2937;
            --text-muted: #6b7280;
            --success: #10b981;
            --danger: #ef4444;
            --disabled: #d1d5db;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: var(--background);
            color: var(--text-main);
            margin: 0;
            padding: 0;
        }

        nav {
            background-color: var(--primary);
            color: white;
            padding: 1rem 2rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .btn-outline { background: transparent; color: white; border: 1px solid white; padding: 0.5rem 1rem; border-radius: 4px; text-decoration: none; font-weight: bold;}
        .btn-outline:hover { background: rgba(255,255,255,0.1); }
        .btn-primary { background: var(--primary); color: white; padding: 0.5rem 1rem; border: none; border-radius: 4px; text-decoration: none; cursor: pointer; font-weight: bold;}
        .btn-primary:hover { background: var(--primary-dark); }
        
        .container { max-width: 1000px; margin: 2rem auto; padding: 0 1rem; }
        
        /* Grid and Cards */
        .card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1.5rem; }
        .group-card { background: var(--card-bg); border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); cursor: pointer; text-decoration: none; color: inherit; display: block; transition: 0.2s;}
        .group-card:hover { transform: translateY(-5px); box-shadow: 0 10px 15px rgba(0,0,0,0.1); }
        .card-header { color: white; padding: 1.5rem; height: 60px; }
        .card-body { padding: 1.5rem; }

        /* Role Selection Specific */
        .role-selection-container { display: flex; justify-content: center; gap: 2rem; margin-top: 5rem; }
        .role-btn { padding: 2rem; font-size: 1.5rem; border-radius: 12px; text-align: center; width: 250px; }
    </style>
</head>
<body>

    <nav>
        <h2 style="margin: 0;">Piao Event Management System</h2>
        @if(!request()->is('/'))
            <a href="{{ url('/') }}" class="btn-outline">Sign Out</a>
        @endif
    </nav>

    <div class="container">
        @yield('content')
    </div>

  
    @stack('scripts')
</body>
</html>