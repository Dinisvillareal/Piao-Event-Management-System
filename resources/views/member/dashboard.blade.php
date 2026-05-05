@extends('layout.app')

@section('content')
    <h2>My Memberships</h2>

    <div class="card-grid">
        @foreach($memberships as $group)
            <a href="#" class="group-card">
                <div class="card-header" style="background-color: {{ $group['color'] }}">
                    <h3 style="margin:0">{{ $group['name'] }}</h3>
                </div>
                <div class="card-body">
                    <p style="margin:0; color:#6b7280;">Role: {{ $group['role'] }}</p>
                </div>
            </a>
        @endforeach
    </div>
@endsection