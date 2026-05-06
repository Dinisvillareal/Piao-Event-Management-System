<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Staff Panel - Roxas Barangay System</title>
    <style>
        :root {
            --primary: #2563eb;
            --primary-dark: #1d4ed8;
            --background: #f3f4f6;
            --sidebar-bg: #1f2937;
            --card-bg: #ffffff;
            --text-main: #1f2937;
            --text-muted: #6b7280;
            --text-light: #f9fafb;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: var(--background);
            color: var(--text-main);
            margin: 0;
            padding: 0;
            display: flex; /* Makes the body a flex container */
            min-height: 100vh;
        }

        /* Sidebar Styles */
        aside.sidebar {
            width: 250px;
            background-color: var(--sidebar-bg);
            color: var(--text-light);
            display: flex;
            flex-direction: column;
        }

        .sidebar-header {
            padding: 1.5rem;
            background-color: #111827; /* Slightly darker top */
            font-weight: bold;
            font-size: 1.2rem;
            text-align: center;
        }

        .sidebar-nav {
            padding: 1rem;
            flex-grow: 1;
        }

        .nav-link {
            display: block;
            padding: 0.75rem 1rem;
            color: #d1d5db;
            text-decoration: none;
            border-radius: 6px;
            margin-bottom: 0.5rem;
            transition: 0.2s;
        }

        .nav-link:hover {
            background-color: #374151;
            color: white;
        }

        .nav-link.active {
            background-color: var(--primary);
            color: white;
        }

        .sidebar-footer {
            padding: 1rem;
        }

        /* Main Content Styles */
        main.content {
            flex-grow: 1;
            padding: 2rem 3rem;
            overflow-y: auto;
        }

        /* Reused Components */
        .card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1.5rem; }
        .group-card { background: var(--card-bg); border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); text-decoration: none; color: inherit; display: block; transition: 0.2s;}
        .group-card:hover { transform: translateY(-5px); box-shadow: 0 10px 15px rgba(0,0,0,0.1); }
        .card-header { color: white; padding: 1.5rem; height: 60px; }
        .card-body { padding: 1.5rem; }
        
        .stat-card { background: white; padding: 1.5rem; border-radius: 8px; border-left: 4px solid var(--primary); box-shadow: 0 2px 4px rgba(0,0,0,0.05);}
        .btn-danger { display: block; text-align: center; background: #ef4444; color: white; padding: 0.75rem; border-radius: 6px; text-decoration: none; }
    </style>
</head>
<body>

    <!-- Sidebar Navigation -->
    <aside class="sidebar">
        <div class="sidebar-header">
            Piao Admin
        </div>
        <div class="sidebar-nav">
            <!-- Laravel's request()->routeIs() checks if the link matches the current URL to highlight it -->
            <a href="{{ route('staff.dashboard') }}" class="nav-link {{ request()->routeIs('staff.dashboard') ? 'active' : '' }}">
                📊 Dashboard
            </a>
        </div>
        <div class="sidebar-footer">
            <a href="{{ url('/') }}" class="btn-danger">Sign Out</a>
        </div>
    </aside>

    <!-- Main Content Area -->
    <main class="content">
        @yield('content')
    </main>

    @stack('scripts')
</body>
</html>