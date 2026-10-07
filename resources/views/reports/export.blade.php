<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>{{ $reportTitle }}</title>
<style>
  {{-- DejaVu Sans is bundled with dompdf and reliably renders the Peso
       sign (₱) and other extended glyphs -- Helvetica/Arial (dompdf's
       other built-in defaults) can silently drop it on some builds. --}}
  {{-- Explicit page margin instead of leaving it to dompdf's own default --
       this is what guarantees every page, including one a card gets
       pushed onto by a page break, opens with a proper gutter of white
       space instead of content butting right up against the paper edge. --}}
  @page { margin: 14mm 12mm 18mm 12mm; }
  body { font-family: 'DejaVu Sans', sans-serif; color: #1a1a1a; font-size: 11px; }
  .center { text-align: center; }
  .hdr-table { width: 100%; border-collapse: collapse; }
  .hdr-logo-cell { width: 86px; vertical-align: middle; }
  .hdr-text-cell { vertical-align: middle; }
  .hdr-logo { width: 70px; height: 70px; }
  .muted { color: #667777; font-size: 9px; }
  .tiny { color: #667777; font-size: 8px; letter-spacing: 1px; text-transform: uppercase; }
  h1.brgy { color: #000000; font-size: 12.5px; margin: 4px 0; text-transform: uppercase; letter-spacing: 0.5px; }
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
  {{-- Record-list cards ("Per-Event Breakdown", "Inventory Items", ...) hold
       an open-ended number of entries. dompdf can't close and re-open a
       bordered card across a page break -- the border simply runs off the
       bottom of one page and the entries restart flush at the top of the
       next with no frame or gutter. So instead of one long card, the list
       is split server-side (see $pageRows in the PHP block below) into one
       complete, closed card per page: each page gets its own rounded frame,
       the heading repeats with "(continued)", and every card is
       page-break-inside:avoid so nothing is ever sliced through the middle
       of an entry or the frame. Same look as the browser print preview. --}}
  .card.card-list { page-break-inside: avoid; }
  .card h3 .cont { color: #8a8f8f; font-size: 9px; font-weight: normal; }
  .row-2col { width: 100%; border-collapse: separate; border-spacing: 6px 0; margin-top: 12px; table-layout: fixed; page-break-inside: avoid; }
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

  .mini-grid { width: 100%; border-collapse: separate; border-spacing: 5px; margin-top: 2px; table-layout: fixed; page-break-inside: avoid; }
  .mini-cell { width: 50%; vertical-align: top; border: 1px solid #eee2d3; background: #fafaf7; border-radius: 12px; padding: 9px 11px; page-break-inside: avoid; }
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
  table.plain th, table.plain td { border: 1px solid #DCEAE5; padding: 5px 7px; font-size: 10px; text-align: left; }
  table.plain tr { page-break-inside: avoid; }
  table.plain th { background: #17365D; color: #fff; }
  {{-- The signature block used to carry ~110px of pure top spacing
       (60px margin + 50px cell padding), sized for trailing a nearly-full
       page. For a short report -- few events, little data -- that's often
       *more* space than what's actually left on the page, so dompdf (like
       any print engine) pushed the whole block to a fresh page rather
       than split it, leaving a big empty gap at the bottom of the page it
       left and an almost-blank final page. Trimmed down and wrapped in
       one page-break-inside:avoid box below so it fits the remaining
       space in the common case, and still moves as one clean unit on the
       rare page it doesn't. --}}
  .rec-title h3 { color: #005F63; font-size: 13px; margin: 14px 0 2px; }
  .rec-newpage { page-break-before: always; }
  .rec-head { background: #EEF4F1; border: 1px solid #DCEAE5; padding: 7px 10px; margin-top: 10px; page-break-after: avoid; page-break-inside: avoid; }
  .rec-name { color: #000000; font-size: 11px; font-weight: bold; }
  .rec-meta { color: #222222; font-size: 9px; margin-top: 2px; }
  .rec-stats { color: #333333; font-size: 9px; margin-top: 3px; }
  table.rec-table { width: 100%; border-collapse: collapse; margin-top: 0; }
  table.rec-table thead { display: table-header-group; }
  table.rec-table th, table.rec-table td { font-size: 9px; padding: 3px 5px; }
  .sig-wrap { page-break-inside: avoid; margin-top: 52px; }
  .sig-row { width: 100%; border-collapse: collapse; }
  .sig-row td { border: none; text-align: center; font-size: 10px; padding: 0; }
  .sig-row td.sig-label { text-align: left; font-weight: bold; font-size: 10.5px; color: #1a1a1a; }
  .sig-row td.sig-space { height: 46px; }
  .sig-line { border-top: 1px solid #667777; padding-top: 4px; margin: 0 40px; font-weight: bold; font-size: 10.5px; color: #1a1a1a; }
  .msg { margin-top: 4px; }
  .msg h4 { color: #000000; font-size: 12px; margin: 10px 0 6px; letter-spacing: 0.5px; }
  .msg p { font-size: 10.5px; line-height: 1.55; text-align: justify; text-indent: 26px; margin: 0 0 7px; color: #1a1a1a; }
  .footer { text-align: center; color: #999; font-size: 8px; margin-top: 10px; }
</style>
</head>
<body>
  <div style="padding-bottom: 6px;">
    {{-- Left-aligned letterhead: seal and address block on the left, system name and
         generation date on the right, then a heavy rule and the report title row. --}}
    @php
      // dompdf hands PNG embedding off to its bundled Cpdf renderer, which
      // requires the PHP GD extension to decode it -- a server without GD
      // (common on a default XAMPP/Laragon install where it isn't enabled
      // in php.ini) throws the moment it hits a <img src="...png"> and
      // takes the *entire* report download down with it, not just the
      // logo. dompdf's JPEG path, by contrast, embeds the file's bytes
      // directly with no GD involved at all -- so the seal is shipped as
      // a pre-flattened JPEG (public/logo-removebg-preview.jpg, generated
      // once from the source PNG) purely to route around that dependency,
      // and the logo now always renders regardless of the server's GD
      // setup. Word's own export keeps using the original PNG in
      // ReportController@buildWordDocument, since PhpWord embeds a local
      // file's bytes as-is and never needed GD to begin with.
      $logoPath = public_path('logo-removebg-preview.jpg');
      $canRenderLogo = is_file($logoPath);
    @endphp
    <table class="hdr-table"><tr>
      <td class="hdr-logo-cell">
        @if($canRenderLogo)
          <img src="{{ $logoPath }}" class="hdr-logo">
        @endif
      </td>
      <td class="hdr-text-cell">
        <p class="tiny" style="margin:0; color:#222222; font-weight:bold;">Republic of the Philippines</p>
        <p class="muted" style="margin:2px 0 0 0; color:#222222; font-size:9.5px;">Western Mindanao, Region IX</p>
        <p class="muted" style="margin:0; color:#222222; font-size:9.5px;">Province of Zamboanga del Norte</p>
        <p class="muted" style="margin:0; color:#222222; font-size:9.5px;">Municipality of President Manuel A. Roxas</p>
        <h1 class="brgy" style="margin:6px 0 4px 0;">Barangay Piao</h1>
        <p class="muted" style="margin:0; color:#222222; font-size:9.5px;">Purok Uno — Barangay Hall, Piao, Roxas, Zamboanga del Norte, 7102</p>
      </td>
      <td style="width:130px; text-align:right; vertical-align:top;">
        <p class="system" style="margin:0;">Piao Connect</p>
        <p class="muted" style="margin:8px 0 0 0;">Generated on</p>
        <p class="muted" style="margin:1px 0 0 0; color:#005F63; font-weight:bold;">{{ now()->format('F j, Y') }}</p>
      </td>
    </tr></table>
    <div style="border-top: 3px solid #005F63; margin-top: 8px;"></div>
    <table class="hdr-table" style="margin-top: 8px;"><tr>
      <td style="vertical-align: bottom;"><h2 class="title" style="margin: 0;">{{ $reportTitle }}</h2></td>
      <td style="vertical-align: bottom; text-align: right; width: 45%;"><p class="muted" style="margin: 0;">{{ $filterSummary }}</p></td>
    </tr></table>
    <div style="border-top: 1px solid #ddd5ca; margin-top: 6px;"></div>
  </div>

  @if(!empty($message))
  <div class="msg">
    <h4>I.&nbsp;&nbsp;&nbsp;MESSAGE</h4>
    @foreach($message as $para)
      <p>{{ $para }}</p>
    @endforeach
    <h4 style="margin-top: 26px;">II.&nbsp;&nbsp;&nbsp;REPORT DETAILS</h4>
  </div>
  @endif

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
    // Which sections to print. null = everything except the (opt-in) attendee lists.
    $show = fn ($key) => $sections === null || in_array($key, $sections, true);
    $showRecords = is_array($sections) && in_array('records', $sections, true);
    $chipColor = fn ($condition) => $conditionColors[$condition] ?? ['bg' => '#F3F4F6', 'text' => '#6B7280'];

    // (Page 1 now also carries the opening Message, so the first-page counts are
    // small; 0 means "start the list on a fresh page".)
    // [rows that fit on the page the list starts on, rows per later page],
    // one "row" being a 2-up pair of entries. Tuned against real dompdf
    // output for A4 with the @page margins above -- each list's entries are
    // a different height, so each has its own numbers. Deliberately a hair
    // conservative: a card that is a row short just leaves a little white
    // space above the bottom margin, while one row too many would push the
    // whole card to the next page.
    $rowCaps = [
        'Per-Event Breakdown' => [0, 7],
        'Enrollment by Membership' => [2, 7],
        'Budget per Event' => [4, 8],
        'Inventory Items' => [3, 9],
    ];
    // Entries are clipped to one line so a long name can't wrap, grow its row
    // and push a page-sized card past the bottom margin.
    $cut = fn ($text, int $max) => mb_strimwidth((string) $text, 0, $max, '…');
    // Splits a collection into 2-up rows, then into page-sized groups
    // (first group sized for the remainder of the first page).
    $pageRows = function ($items, int $firstCap, int $perPage) {
        $rows = $items->chunk(2)->values();
        $groups = [];
        $i = 0;
        $cap = $firstCap > 0 ? $firstCap : max(1, $perPage);
        while ($i < $rows->count()) {
            $groups[] = $rows->slice($i, $cap)->values();
            $i += $cap;
            $cap = max(1, $perPage);
        }
        return $groups;
    };
  @endphp

  @if($type === 'attendance')
    @if($show('summary'))
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
    @endif

    {{-- Same lg:grid-cols-3 (2 cols + 1 col) row as the on-screen page --
         "Events per Month" and "Overall Attendance" sit side by side, not
         stacked, so this copies that arrangement instead of just matching
         each card on its own. --}}
    @if($show('charts'))
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
    @endif

    @if($show('age'))
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
    @endif

    @if($show('events'))
    @php $groups = $pageRows($data['per_event'], $rowCaps['Per-Event Breakdown'][0], $rowCaps['Per-Event Breakdown'][1]); @endphp
    @forelse($groups as $gi => $rowGroup)
    <div class="card card-list">
      <h3>Per-Event Breakdown @if($gi > 0) <span class="cont">(continued)</span>@endif</h3>
      @foreach($rowGroup as $pair)
        <table class="mini-grid"><tr>
          @foreach($pair as $ev)
            <td class="mini-cell">
              <div class="mini-title">{{ $cut($ev['name'], 38) }}</div>
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
      @endforeach
    </div>
    @empty
    <div class="card card-list"><h3>Per-Event Breakdown</h3><p class="empty">No records for this period.</p></div>
    @endforelse
    @endif

    @if($showRecords)
      @php
        $recEvents = collect($data['per_event'])->filter(fn ($e) => array_key_exists('attendees', $e))->values();
        $recOthers = is_array($sections) && count(array_diff($sections, ['records'])) > 0;
      @endphp
      <div class="rec-title {{ $recOthers ? 'rec-newpage' : '' }}">
        <h3>Event Attendance Records</h3>
        <p class="desc">Every event in the period with the residents who were eligible to attend and whether each one signed in.</p>
      </div>
      @forelse($recEvents as $ev)
        <div class="rec-head">
          <div class="rec-name">{{ $ev['name'] }}</div>
          <div class="rec-meta">
            {{ $ev['date'] ?? '—' }}@if(!empty($ev['start_time'])) &middot; {{ $ev['start_time'] }}@if(!empty($ev['end_time'])) – {{ $ev['end_time'] }}@endif @endif
            @if(!empty($ev['location'])) &middot; {{ $ev['location'] }}@endif
            &middot; {{ $ev['status'] }}
          </div>
          <div class="rec-stats">
            Eligible: <b>{{ $ev['eligible'] }}</b> &nbsp; Present: <b style="color:#047857;">{{ $ev['attended'] }}</b> &nbsp; Absent: <b style="color:#DC2626;">{{ $ev['absent'] }}</b> &nbsp; Attendance rate: <b>{{ $ev['percentage'] }}%</b>
          </div>
        </div>
        @if(count($ev['attendees']) === 0)
          <p class="empty" style="margin: 6px 0 14px;">No attendees to list for this event.</p>
        @else
          <table class="plain rec-table">
            <thead><tr><th style="width:24px;">#</th><th>Name</th><th style="width:62px;">ID</th><th style="width:28px;">Age</th><th style="width:44px;">Gender</th><th style="width:52px;">Status</th><th style="width:52px;">Time In</th><th style="width:52px;">Time Out</th></tr></thead>
            <tbody>
            @foreach($ev['attendees'] as $i => $a)
              <tr>
                <td>{{ $i + 1 }}</td>
                <td style="font-weight:bold;">{{ $a['name'] }}</td>
                <td>{{ $a['user_code'] ?? '—' }}</td>
                <td>{{ $a['age'] ?? '—' }}</td>
                <td>{{ $a['gender'] ?? '—' }}</td>
                <td>{{ $a['attendance'] }}</td>
                <td>{{ $a['time_in'] ?? '—' }}</td>
                <td>{{ $a['time_out'] ?? '—' }}</td>
              </tr>
            @endforeach
            </tbody>
          </table>
          <div style="height:12px;"></div>
        @endif
      @empty
        <p class="empty">No events to list for this period.</p>
      @endforelse
    @endif

  @elseif($type === 'membership')
    @if($show('summary'))
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
    @endif

    @if($show('memberships'))
    @php $groups = $pageRows($data['per_membership'], $rowCaps['Enrollment by Membership'][0], $rowCaps['Enrollment by Membership'][1]); @endphp
    @forelse($groups as $gi => $rowGroup)
    <div class="card card-list">
      <h3>Enrollment by Membership @if($gi > 0) <span class="cont">(continued)</span>@endif</h3>
      @foreach($rowGroup as $pair)
        <table class="mini-grid"><tr>
          @foreach($pair as $m)
            @php
              $reqs = implode(' • ', array_filter([$m['eligible_age_bracket'] ?? null, $m['eligible_civil_status'] ?? null, $m['eligible_gender'] ?? null]));
            @endphp
            <td class="mini-cell">
              <div class="mini-title">{{ $cut($m['name'], 38) }}</div>
              <div class="mini-big">{{ $m['member_count'] }}</div>
              <div class="mini-sub">members</div>
              @if($reqs !== '')
                <div class="chip" style="background:#E6F5F3; color:#0F766E; margin-top:6px;">Requires: {{ $reqs }}</div>
              @endif
            </td>
          @endforeach
          @if($pair->count() < 2)<td class="mini-cell" style="visibility:hidden;"></td>@endif
        </tr></table>
      @endforeach
    </div>
    @empty
    <div class="card card-list"><h3>Enrollment by Membership</h3><p class="empty">No memberships found.</p></div>
    @endforelse
    @endif

  @elseif($type === 'budget')
    @php $peso = fn ($n) => '₱' . number_format((float) $n, 2); @endphp
    @if($show('summary'))
    <table class="stat-table">
      <tr>
        <td class="stat-cell"><div class="stat-box" style="background:#456F68;">
          <div class="stat-value">{{ $peso($data['summary']['total_approved_budget']) }}</div>
          <div class="stat-label">Total Approved Budget</div>
        </div></td>
        <td class="stat-cell"><div class="stat-box" style="background:#C6953C;">
          <div class="stat-value">{{ $peso($data['summary']['total_expenses']) }}</div>
          <div class="stat-label">Total Expenses</div>
        </div></td>
        <td class="stat-cell"><div class="stat-box" style="background:#2A423E;">
          <div class="stat-value">{{ $peso($data['summary']['total_remaining']) }}</div>
          <div class="stat-label">Remaining Budget</div>
        </div></td>
        <td class="stat-cell"><div class="stat-box" style="background:#8A3D2C;">
          <div class="stat-value">{{ $data['summary']['events_over_budget'] }}</div>
          <div class="stat-label">Events Over Budget</div>
        </div></td>
      </tr>
    </table>
    <table class="stat-table">
      <tr>
        <td class="stat-cell"><div class="stat-box" style="background:#3F6B66;">
          <div class="stat-value">{{ $data['summary']['utilization_percentage'] }}%</div>
          <div class="stat-label">Budget Used</div>
        </div></td>
        <td class="stat-cell"><div class="stat-box" style="background:#9A4A38;">
          <div class="stat-value">{{ $peso($data['summary']['total_over_amount']) }}</div>
          <div class="stat-label">Total Over Budget</div>
        </div></td>
        <td class="stat-cell"><div class="stat-box" style="background:#8C6A2B;">
          <div class="stat-value">{{ $data['summary']['events_near_limit'] }}</div>
          <div class="stat-label">Events Near Limit (90%+)</div>
        </div></td>
        <td class="stat-cell"><div class="stat-box" style="background:#33504B;">
          <div class="stat-value">{{ $data['summary']['total_expense_entries'] }}</div>
          <div class="stat-label">Expense Entries</div>
        </div></td>
      </tr>
    </table>
    @endif

    @if($show('overBudget'))
    <div class="card">
      <h3>Over-Budget Events</h3>
      <p class="desc">Events whose recorded expenses are higher than the approved budget, largest overspend first.</p>
      @if(empty($data['over_budget']) || count($data['over_budget']) === 0)
        <p class="empty" style="color:#0F766E;">No events are over budget for this period.</p>
      @else
        <table class="plain">
          <thead><tr><th>Event</th><th style="width:62px;">Date</th><th style="width:72px; text-align:right;">Approved</th><th style="width:72px; text-align:right;">Spent</th><th style="width:72px; text-align:right;">Over By</th><th style="width:38px; text-align:right;">Used</th></tr></thead>
          <tbody>
          @foreach($data['over_budget'] as $ev)
            <tr>
              <td>{{ $cut($ev['name'], 44) }}</td>
              <td>{{ $ev['date'] ?? '—' }}</td>
              <td style="text-align:right;">{{ $peso($ev['approved_budget']) }}</td>
              <td style="text-align:right;">{{ $peso($ev['total_expenses']) }}</td>
              <td style="text-align:right; font-weight:bold; color:#DC2626;">{{ $peso($ev['over_by']) }}</td>
              <td style="text-align:right;">{{ $ev['utilization'] }}%</td>
            </tr>
          @endforeach
          </tbody>
        </table>
      @endif
    </div>
    @endif

    @if($show('perEvent'))
    @php $groups = $pageRows(collect($data['per_event']), 1, 7); @endphp
    @forelse($groups as $gi => $rowGroup)
    <div class="card card-list">
      <h3>Budget per Event @if($gi > 0) <span class="cont">(continued)</span>@endif</h3>
      @foreach($rowGroup as $pair)
        <table class="mini-grid"><tr>
          @foreach($pair as $ev)
            <td class="mini-cell {{ $ev['is_over_budget'] ? 'over-budget' : '' }}">
              <div class="mini-title">{{ $cut($ev['name'], 38) }}</div>
              <div class="mini-sub">{{ $ev['date'] ?? '—' }} &middot; {{ $ev['event_status'] }} &middot; {{ $ev['budget_status'] }}</div>
              <div class="mini-line">Budget: {{ $peso($ev['approved_budget']) }} &middot; Spent: {{ $peso($ev['total_expenses']) }}</div>
              <div class="mini-line">{{ $ev['utilization'] }}% used &middot; {{ $ev['expense_count'] }} {{ $ev['expense_count'] === 1 ? 'entry' : 'entries' }}</div>
              <div class="mini-line" style="font-weight:bold; color:{{ $ev['is_over_budget'] ? '#DC2626' : '#0F766E' }};">
                {{ $ev['is_over_budget'] ? 'Over budget by' : 'Remaining' }} {{ $peso(abs($ev['remaining'])) }}
              </div>
            </td>
          @endforeach
          @if($pair->count() < 2)<td class="mini-cell" style="visibility:hidden;"></td>@endif
        </tr></table>
      @endforeach
    </div>
    @empty
    <div class="card card-list"><h3>Budget per Event</h3><p class="empty">No events for this period.</p></div>
    @endforelse
    @endif

    @if($show('expenses'))
      @php
        $withItems = collect($data['per_event'])->concat($data['unbudgeted'] ?? [])->filter(fn ($ev) => !empty($ev['expenses']))->values();
        $expOthers = is_array($sections) && count(array_diff($sections, ['expenses'])) > 0;
      @endphp
      @if($withItems->isNotEmpty())
        <div class="rec-title {{ $expOthers ? 'rec-newpage' : '' }}">
          <h3>Itemized Expenses per Event</h3>
          <p class="desc">Every expense entry recorded against each event.</p>
        </div>
        @foreach($withItems as $ev)
          <div class="rec-head" @if(!empty($ev['is_over_budget'])) style="background:#FEF2F2; border-color:#FECACA;" @endif>
            <div class="rec-name">{{ $ev['name'] }}</div>
            <div class="rec-meta">{{ $ev['date'] ?? '—' }} &middot; {{ $ev['event_status'] }}</div>
            <div class="rec-stats">
              @if(array_key_exists('approved_budget', $ev))
                Budget: <b>{{ $peso($ev['approved_budget']) }}</b> &nbsp; Spent: <b>{{ $peso($ev['total_expenses']) }}</b> &nbsp;
                @if($ev['is_over_budget']) <b style="color:#DC2626;">Over by {{ $peso($ev['over_by']) }}</b> @else Remaining: <b style="color:#0F766E;">{{ $peso($ev['remaining']) }}</b> @endif
              @else
                <b>No approved budget</b> &nbsp; Spent: <b>{{ $peso($ev['total_expenses']) }}</b>
              @endif
            </div>
          </div>
          <table class="plain rec-table">
            <thead><tr><th style="width:22px;">#</th><th>Item</th><th style="width:70px; text-align:right;">Amount</th><th>Notes</th><th style="width:80px;">Recorded By</th><th style="width:56px;">Date</th></tr></thead>
            <tbody>
            @foreach($ev['expenses'] as $i => $x)
              <tr>
                <td>{{ $i + 1 }}</td>
                <td>{{ $x['item'] }}</td>
                <td style="text-align:right;">{{ $peso($x['amount']) }}</td>
                <td>{{ $x['notes'] ?: '—' }}</td>
                <td>{{ $x['recorded_by'] ?: '—' }}</td>
                <td>{{ $x['date'] ?? '—' }}</td>
              </tr>
            @endforeach
              <tr>
                <td></td><td style="font-weight:bold; background:#EEF4F1;">Total</td>
                <td style="text-align:right; font-weight:bold; background:#EEF4F1;">{{ $peso($ev['total_expenses']) }}</td>
                <td colspan="3" style="background:#EEF4F1;"></td>
              </tr>
            </tbody>
          </table>
          <div style="height:12px;"></div>
        @endforeach
      @endif
    @endif

    @if($show('topExpenses'))
    @if(!empty($data['top_expenses']) && count($data['top_expenses']))
      <div class="card">
        <h3>Top Expenses</h3>
        <table class="plain">
          <thead><tr><th>Item</th><th>Event</th><th style="text-align:right;">Amount</th></tr></thead>
          <tbody>
          @foreach($data['top_expenses'] as $ex)
            <tr>
              <td>{{ $ex['item'] }}</td>
              <td>{{ $ex['event_name'] ?? '—' }}</td>
              <td style="text-align:right;">{{ $peso($ex['amount']) }}</td>
            </tr>
          @endforeach
          </tbody>
        </table>
      </div>
    @endif
    @endif

    @if($show('noBudget'))
    @if(!empty($data['unbudgeted']) && count($data['unbudgeted']))
      <div class="card">
        <h3>Events Without an Approved Budget</h3>
        <p class="desc">Events in this period that have no approved budget set, so they are not counted in the totals above.</p>
        <table class="plain">
          <thead><tr><th>Event</th><th style="width:62px;">Date</th><th style="width:56px;">Status</th><th style="width:42px; text-align:right;">Entries</th><th style="width:76px; text-align:right;">Spent</th></tr></thead>
          <tbody>
          @foreach($data['unbudgeted'] as $ev)
            <tr>
              <td>{{ $cut($ev['name'], 48) }}</td>
              <td>{{ $ev['date'] ?? '—' }}</td>
              <td>{{ $ev['event_status'] }}</td>
              <td style="text-align:right;">{{ $ev['expense_count'] }}</td>
              <td style="text-align:right;">{{ $peso($ev['total_expenses']) }}</td>
            </tr>
          @endforeach
          </tbody>
        </table>
      </div>
    @endif
    @endif

  @else
    @if($show('summary'))
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
    @endif

    @if($show('condition'))
    <div class="card">
      <h3>By Condition</h3>
      @forelse($data['by_condition'] as $c)
        @php $cc = $chipColor($c['condition']); @endphp
        <span class="chip" style="background:{{ $cc['bg'] }}; color:{{ $cc['text'] }};">{{ $c['condition'] }}: {{ $c['count'] }} items ({{ $c['quantity'] }} units)</span>
      @empty
        <p class="empty">No items found.</p>
      @endforelse
    </div>
    @endif

    @if($show('items'))
    @php $groups = $pageRows($data['items'], $rowCaps['Inventory Items'][0], $rowCaps['Inventory Items'][1]); @endphp
    @forelse($groups as $gi => $rowGroup)
    <div class="card card-list">
      <h3>Inventory Items @if($gi > 0) <span class="cont">(continued)</span>@endif</h3>
      @foreach($rowGroup as $pair)
        <table class="mini-grid"><tr>
          @foreach($pair as $item)
            @php $cc = $chipColor($item['condition']); @endphp
            <td class="mini-cell">
              <div class="mini-title">{{ $cut($item['name'], 38) }}</div>
              <div class="mini-sub">{{ $cut($item['storage_location'] ?? '—', 60) }}</div>
              <table class="progress-row"><tr>
                <td><span class="chip" style="background:{{ $cc['bg'] }}; color:{{ $cc['text'] }};">{{ $item['condition'] }}</span></td>
                <td class="progress-pct" style="text-align:right;">×{{ $item['quantity'] }}</td>
              </tr></table>
            </td>
          @endforeach
          @if($pair->count() < 2)<td class="mini-cell" style="visibility:hidden;"></td>@endif
        </tr></table>
      @endforeach
    </div>
    @empty
    <div class="card card-list"><h3>Inventory Items</h3><p class="empty">No items found.</p></div>
    @endforelse
    @endif

  @endif

  <div class="sig-wrap">
    <table class="sig-row" style="border: none;">
      <tr>
        <td class="sig-label" style="width: 50%;">Prepared by:</td>
        <td class="sig-label" style="width: 50%;">Noted:</td>
      </tr>
      <tr><td class="sig-space"></td><td class="sig-space"></td></tr>
      <tr>
        <td><div class="sig-line">Brgy. Secretary</div></td>
        <td><div class="sig-line">Barangay Captain</div></td>
      </tr>
    </table>
    <p class="footer">Generated via Piao Connect — Barangay Information Management System · {{ $printedOn }}</p>
  </div>
</body>
</html>
