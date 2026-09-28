<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>{{ $reportTitle }}</title>
<style>
  {{-- DejaVu Sans is bundled with dompdf and reliably renders the Peso
       sign (₱) and other extended glyphs -- Helvetica/Arial (dompdf's
       other built-in defaults) can silently drop it on some builds. --}}
  body { font-family: 'DejaVu Sans', sans-serif; color: #1a1a1a; font-size: 11px; }
  .center { text-align: center; }
  .muted { color: #667777; font-size: 9px; }
  .tiny { color: #667777; font-size: 8px; letter-spacing: 1px; text-transform: uppercase; }
  h1.brgy { color: #005F63; font-size: 20px; margin: 4px 0; text-transform: uppercase; }
  .system { color: #4FBEB0; font-size: 9px; font-weight: bold; letter-spacing: 2px; text-transform: uppercase; margin-top: 4px; }
  h2.title { color: #005F63; font-size: 15px; text-transform: uppercase; margin-top: 14px; margin-bottom: 2px; }

  {{-- Same "cards + charts" visual language as the on-screen/printed
       Reports & Analytics page (ReportsView.tsx), rebuilt with
       dompdf-safe HTML/CSS (no flexbox/grid/SVG, which dompdf's layout
       engine only partially supports) instead of the old plain
       letterhead + data-table look -- this is what makes the download
       actually match the page it was generated from. --}}
  .stat-table { width: 100%; border-collapse: separate; border-spacing: 5px; margin-top: 10px; page-break-inside: avoid; }
  .stat-cell { width: 25%; vertical-align: top; padding: 0; }
  .stat-box { border-radius: 14px; padding: 12px 12px 10px; color: #ffffff; }
  .stat-value { font-size: 20px; font-weight: bold; margin: 3px 0 2px; }
  .stat-label { font-size: 8px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: bold; }

  .card { border: 1px solid #ddd5ca; border-radius: 16px; padding: 12px 15px 14px; margin-top: 12px; page-break-inside: avoid; }
  .row-2col { width: 100%; border-collapse: separate; border-spacing: 6px 0; margin-top: 12px; table-layout: fixed; }
  .row-2col-cell { vertical-align: top; padding: 0; }
  .card h3 { color: #005F63; font-size: 12px; margin: 0 0 2px; }
  .card .desc { color: #8a8f8f; font-size: 8px; margin: 0 0 8px; }
  .card .empty { color: #aaaaaa; font-size: 9px; font-style: italic; text-align: center; padding: 14px 0; }

  .bar-table { width: 100%; border-collapse: collapse; margin-top: 4px; table-layout: fixed; }
  .bar-cell { text-align: center; vertical-align: bottom; padding: 0 3px; }
  .bar-track { height: 90px; position: relative; }
  .bar-fill { position: absolute; bottom: 0; left: 15%; right: 15%; border-radius: 3px 3px 0 0; }
  .bar-value { font-size: 8.5px; font-weight: bold; color: #333333; margin-bottom: 3px; }
  .bar-label { font-size: 7.5px; color: #8a8f8f; margin-top: 4px; }

  .donut-wrap { text-align: center; padding: 10px 0 2px; }
  .donut-value { font-size: 30px; font-weight: bold; color: #4FBEB0; }
  .donut-track { height: 8px; background: #eef2f2; border-radius: 4px; margin: 8px 30px 0; overflow: hidden; }
  .donut-fill { height: 8px; background: #4FBEB0; border-radius: 4px; }
  .donut-caption { font-size: 8.5px; color: #8a8f8f; margin-top: 6px; }

  .mini-grid { width: 100%; border-collapse: separate; border-spacing: 5px; margin-top: 2px; table-layout: fixed; }
  .mini-cell { width: 50%; vertical-align: top; border: 1px solid #eee2d3; background: #fafaf7; border-radius: 12px; padding: 9px 11px; }
  .mini-cell.over-budget { border-color: #fecaca; background: #fef2f2; }
  .mini-title { font-weight: bold; color: #005F63; font-size: 10px; }
  .mini-sub { color: #999999; font-size: 8px; margin-top: 1px; }
  .mini-big { font-size: 19px; font-weight: bold; color: #333333; margin-top: 3px; }
  .mini-line { font-size: 8.5px; color: #667777; margin-top: 3px; }

  .progress-track { height: 6px; background: #eee; border-radius: 3px; overflow: hidden; }
  .progress-row { width: 100%; margin-top: 8px; }
  .progress-row td { padding: 0; vertical-align: middle; }
  .progress-fill { height: 6px; border-radius: 3px; background: #4FBEB0; }
  .progress-pct { font-size: 9px; font-weight: bold; color: #005F63; padding-left: 8px; white-space: nowrap; }

  .chip { display: inline-block; border-radius: 16px; padding: 3px 9px; font-size: 8px; font-weight: bold; margin: 0 4px 4px 0; }

  table.plain { width: 100%; border-collapse: collapse; margin-top: 8px; }
  table.plain th, table.plain td { border: 1px solid #ccc; padding: 5px 7px; font-size: 10px; text-align: left; }
  table.plain th { background: #005F63; color: #fff; }
  .sig-row { width: 100%; border-collapse: collapse; }
  .sig-row td { border: none; text-align: center; font-size: 10px; padding-top: 50px; }
  .sig-line { border-top: 1px solid #667777; padding-top: 4px; margin: 0 30px; }
  .footer { text-align: center; color: #999; font-size: 8px; margin-top: 20px; }
</style>
</head>
<body>
  <div class="center" style="border-bottom: 2px solid #005F63; padding-bottom: 8px;">
    <p class="tiny">Republic of the Philippines</p>
    <p class="muted">Province of Zamboanga del Norte</p>
    <p class="muted">Municipality of President Manuel A. Roxas</p>
    <h1 class="brgy">Barangay Piao</h1>
    <p class="muted">Piao Barangay Hall, Purok Uno, Barangay Piao, 7104</p>
    <p class="system">Piao Connect</p>
    <h2 class="title">{{ $reportTitle }}</h2>
    <p class="muted">{{ $filterSummary }}</p>
  </div>

  @php
    // Turns a Collection of {label,value} rows into dompdf-safe vertical
    // bar-chart data -- dompdf has no flexbox/grid, so the on-screen
    // BarChart's `flex items-end` column is rebuilt here as a fixed-height
    // "track" div with an absolutely-positioned fill div inside it, sized
    // in pixels instead of percentages (table-cell layout +
    // position:absolute is the combination dompdf's renderer actually
    // supports reliably).
    $barItems = function ($items, string $valueKey, string $labelKey, int $maxPx = 88) {
        $max = max(1, (float) ($items->max($valueKey) ?? 0));
        return $items->map(function ($i) use ($valueKey, $labelKey, $max, $maxPx) {
            $v = (float) ($i[$valueKey] ?? 0);
            return [
                'label' => $i[$labelKey] ?? '',
                'value' => $i[$valueKey] ?? 0,
                'heightPx' => $v > 0 ? max(4, (int) round(($v / $max) * $maxPx)) : 2,
            ];
        });
    };
    $conditionColors = [
        'New' => ['bg' => '#E6F5F3', 'text' => '#0F766E'],
        'Good' => ['bg' => '#ECFDF5', 'text' => '#047857'],
        'Fair' => ['bg' => '#FFFBEB', 'text' => '#B45309'],
        'Poor' => ['bg' => '#FFF7ED', 'text' => '#C2410C'],
        'Disposed' => ['bg' => '#F3F4F6', 'text' => '#6B7280'],
        'Lost' => ['bg' => '#FEF2F2', 'text' => '#DC2626'],
    ];
    $chipColor = fn ($condition) => $conditionColors[$condition] ?? ['bg' => '#F3F4F6', 'text' => '#6B7280'];
  @endphp

  @if($type === 'attendance')
    <table class="stat-table">
      <tr>
        <td class="stat-cell"><div class="stat-box" style="background:#456F68;">
          <div class="stat-value">{{ $data['summary']['total_events'] }}</div>
          <div class="stat-label">Events in Range</div>
        </div></td>
        <td class="stat-cell"><div class="stat-box" style="background:#C6953C;">
          <div class="stat-value">{{ $data['summary']['total_attended'] }}</div>
          <div class="stat-label">Attendance Records</div>
        </div></td>
        <td class="stat-cell"><div class="stat-box" style="background:#2A423E;">
          <div class="stat-value">{{ $data['summary']['attendance_percentage'] }}%</div>
          <div class="stat-label">Attendance Rate</div>
        </div></td>
        <td class="stat-cell"><div class="stat-box" style="background:#8A3D2C;">
          <div class="stat-value">{{ $data['summary']['average_feedback_rating'] ?? '—' }}</div>
          <div class="stat-label">Avg Feedback Rating</div>
        </div></td>
      </tr>
    </table>

    {{-- Same lg:grid-cols-3 (2 cols + 1 col) row as the on-screen page --
         "Events per Month" and "Overall Attendance" sit side by side, not
         stacked, so this copies that arrangement instead of just matching
         each card on its own. --}}
    @php $monthBars = $barItems($data['per_month'], 'events', 'month'); @endphp
    <table class="row-2col"><tr>
      <td class="row-2col-cell" style="width:66%;">
        <div class="card" style="margin-top:0;">
          <h3>Events per Month</h3>
          <p class="desc">What events usually happen, and when — across all years in range.</p>
          @if($monthBars->isEmpty())
            <p class="empty">No data for the selected filters.</p>
          @else
            <table class="bar-table"><tr>
              @foreach($monthBars as $b)
                <td class="bar-cell" style="width:{{ 100 / max(1, $monthBars->count()) }}%;">
                  <div class="bar-value">{{ $b['value'] }}</div>
                  <div class="bar-track"><div class="bar-fill" style="height:{{ $b['heightPx'] }}px; background:#4FBEB0;"></div></div>
                  <div class="bar-label">{{ $b['label'] }}</div>
                </td>
              @endforeach
            </tr></table>
          @endif
        </div>
      </td>
      <td class="row-2col-cell" style="width:34%;">
        <div class="card" style="margin-top:0;">
          <h3>Overall Attendance</h3>
          <div class="donut-wrap">
            <div class="donut-value">{{ $data['summary']['attendance_percentage'] }}%</div>
            <div class="donut-track"><div class="donut-fill" style="width:{{ min(100, max(0, $data['summary']['attendance_percentage'])) }}%;"></div></div>
            <div class="donut-caption">{{ $data['summary']['total_attended'] }} of {{ $data['summary']['total_eligible'] }} eligible residents</div>
          </div>
        </div>
      </td>
    </tr></table>

    @php $ageBars = $barItems($data['age_breakdown'], 'attended', 'group'); @endphp
    <div class="card">
      <h3>Attendance by Age Group</h3>
      <p class="desc">Adviser recommendation: resident profiling filtered by age.</p>
      @if($ageBars->isEmpty())
        <p class="empty">No data for the selected filters.</p>
      @else
        <table class="bar-table"><tr>
          @foreach($ageBars as $b)
            <td class="bar-cell" style="width:{{ 100 / max(1, $ageBars->count()) }}%;">
              <div class="bar-value">{{ $b['value'] }}</div>
              <div class="bar-track"><div class="bar-fill" style="height:{{ $b['heightPx'] }}px; background:#E8B84A;"></div></div>
              <div class="bar-label">{{ $b['label'] }}</div>
            </td>
          @endforeach
        </tr></table>
      @endif
    </div>

    <div class="card">
      <h3>Per-Event Breakdown</h3>
      @forelse($data['per_event']->chunk(2) as $pair)
        <table class="mini-grid"><tr>
          @foreach($pair as $ev)
            <td class="mini-cell">
              <div class="mini-title">{{ $ev['name'] }}</div>
              <div class="mini-sub">{{ $ev['date'] ?? '—' }}</div>
              <table class="progress-row"><tr>
                <td><div class="progress-track"><div class="progress-fill" style="width:{{ min(100, max(0, $ev['percentage'])) }}%;"></div></div></td>
                <td class="progress-pct">{{ $ev['percentage'] }}%</td>
              </tr></table>
              <div class="mini-line">{{ $ev['attended'] }} / {{ $ev['eligible'] }} attended</div>
              @if($ev['approved_budget'] !== null)
                <div class="mini-line">Budget: ₱{{ number_format($ev['approved_budget'], 2) }} · Spent: ₱{{ number_format($ev['total_expenses'], 2) }}</div>
              @endif
            </td>
          @endforeach
          @if($pair->count() < 2)<td class="mini-cell" style="visibility:hidden;"></td>@endif
        </tr></table>
      @empty
        <p class="empty">No records for this period.</p>
      @endforelse
    </div>

  @elseif($type === 'membership')
    <table class="stat-table">
      <tr>
        <td class="stat-cell" style="width:50%;"><div class="stat-box" style="background:#456F68;">
          <div class="stat-value">{{ $data['summary']['total_memberships'] }}</div>
          <div class="stat-label">Total Memberships</div>
        </div></td>
        <td class="stat-cell" style="width:50%;"><div class="stat-box" style="background:#C6953C;">
          <div class="stat-value">{{ $data['summary']['total_assignments'] }}</div>
          <div class="stat-label">Total Enrolled Residents</div>
        </div></td>
      </tr>
    </table>

    <div class="card">
      <h3>Enrollment by Membership</h3>
      @forelse($data['per_membership']->chunk(2) as $pair)
        <table class="mini-grid"><tr>
          @foreach($pair as $m)
            @php
              $reqs = implode(' • ', array_filter([$m['eligible_age_bracket'] ?? null, $m['eligible_civil_status'] ?? null, $m['eligible_gender'] ?? null]));
            @endphp
            <td class="mini-cell">
              <div class="mini-title">{{ $m['name'] }}</div>
              <div class="mini-big">{{ $m['member_count'] }}</div>
              <div class="mini-sub">members</div>
              @if($reqs !== '')
                <div class="chip" style="background:#E6F5F3; color:#0F766E; margin-top:6px;">Requires: {{ $reqs }}</div>
              @endif
            </td>
          @endforeach
          @if($pair->count() < 2)<td class="mini-cell" style="visibility:hidden;"></td>@endif
        </tr></table>
      @empty
        <p class="empty">No memberships found.</p>
      @endforelse
    </div>

  @elseif($type === 'budget')
    <table class="stat-table">
      <tr>
        <td class="stat-cell"><div class="stat-box" style="background:#456F68;">
          <div class="stat-value">₱{{ number_format($data['summary']['total_approved_budget'], 2) }}</div>
          <div class="stat-label">Total Approved Budget</div>
        </div></td>
        <td class="stat-cell"><div class="stat-box" style="background:#C6953C;">
          <div class="stat-value">₱{{ number_format($data['summary']['total_expenses'], 2) }}</div>
          <div class="stat-label">Total Expenses</div>
        </div></td>
        <td class="stat-cell"><div class="stat-box" style="background:#2A423E;">
          <div class="stat-value">₱{{ number_format($data['summary']['total_remaining'], 2) }}</div>
          <div class="stat-label">Remaining Budget</div>
        </div></td>
        <td class="stat-cell"><div class="stat-box" style="background:#8A3D2C;">
          <div class="stat-value">{{ $data['summary']['events_over_budget'] }}</div>
          <div class="stat-label">Events Over Budget</div>
        </div></td>
      </tr>
    </table>

    <div class="card">
      <h3>Budget per Event</h3>
      @forelse($data['per_event']->chunk(2) as $pair)
        <table class="mini-grid"><tr>
          @foreach($pair as $ev)
            <td class="mini-cell {{ $ev['is_over_budget'] ? 'over-budget' : '' }}">
              <div class="mini-title">{{ $ev['name'] }}</div>
              <div class="mini-sub">{{ $ev['date'] ?? '—' }}</div>
              <div class="mini-line">Budget: ₱{{ number_format($ev['approved_budget'], 2) }}</div>
              <div class="mini-line">Spent: ₱{{ number_format($ev['total_expenses'], 2) }}</div>
              <div class="mini-line" style="font-weight:bold; color:{{ $ev['is_over_budget'] ? '#DC2626' : '#0F766E' }};">
                {{ $ev['is_over_budget'] ? 'Over budget by' : 'Remaining' }} ₱{{ number_format(abs($ev['remaining']), 2) }}
              </div>
            </td>
          @endforeach
          @if($pair->count() < 2)<td class="mini-cell" style="visibility:hidden;"></td>@endif
        </tr></table>
      @empty
        <p class="empty">No events for this period.</p>
      @endforelse
    </div>

    @if(!empty($data['top_expenses']) && count($data['top_expenses']))
      <div class="card">
        <h3>Top Expenses</h3>
        <table class="plain">
          <thead><tr><th>Item</th><th>Event</th><th>Amount</th></tr></thead>
          <tbody>
          @foreach($data['top_expenses'] as $ex)
            <tr>
              <td>{{ $ex['item'] }}</td>
              <td>{{ $ex['event_name'] ?? '—' }}</td>
              <td>₱{{ number_format($ex['amount'], 2) }}</td>
            </tr>
          @endforeach
          </tbody>
        </table>
      </div>
    @endif

  @else
    <table class="stat-table">
      <tr>
        <td class="stat-cell" style="width:50%;"><div class="stat-box" style="background:#456F68;">
          <div class="stat-value">{{ $data['summary']['total_items'] }}</div>
          <div class="stat-label">Total Inventory Items</div>
        </div></td>
        <td class="stat-cell" style="width:50%;"><div class="stat-box" style="background:#C6953C;">
          <div class="stat-value">{{ $data['summary']['total_quantity'] }}</div>
          <div class="stat-label">Total Quantity</div>
        </div></td>
      </tr>
    </table>

    <div class="card">
      <h3>By Condition</h3>
      @forelse($data['by_condition'] as $c)
        @php $cc = $chipColor($c['condition']); @endphp
        <span class="chip" style="background:{{ $cc['bg'] }}; color:{{ $cc['text'] }};">{{ $c['condition'] }}: {{ $c['count'] }} items ({{ $c['quantity'] }} units)</span>
      @empty
        <p class="empty">No items found.</p>
      @endforelse
    </div>

    <div class="card">
      <h3>Inventory Items</h3>
      @forelse($data['items']->chunk(2) as $pair)
        <table class="mini-grid"><tr>
          @foreach($pair as $item)
            @php $cc = $chipColor($item['condition']); @endphp
            <td class="mini-cell">
              <div class="mini-title">{{ $item['name'] }}</div>
              <div class="mini-sub">{{ $item['storage_location'] ?? '—' }}</div>
              <table class="progress-row"><tr>
                <td><span class="chip" style="background:{{ $cc['bg'] }}; color:{{ $cc['text'] }};">{{ $item['condition'] }}</span></td>
                <td class="progress-pct" style="text-align:right;">×{{ $item['quantity'] }}</td>
              </tr></table>
            </td>
          @endforeach
          @if($pair->count() < 2)<td class="mini-cell" style="visibility:hidden;"></td>@endif
        </tr></table>
      @empty
        <p class="empty">No items found.</p>
      @endforelse
    </div>
  @endif

  <table class="sig-row" style="border: none; margin-top: 60px;">
    <tr>
      <td style="width: 50%;"><div class="sig-line">Prepared by</div></td>
      <td style="width: 50%;"><div class="sig-line">Barangay Captain</div></td>
    </tr>
  </table>

  <p class="footer">Generated via Piao Connect — Barangay Information Management System · {{ $printedOn }}</p>
</body>
</html>
