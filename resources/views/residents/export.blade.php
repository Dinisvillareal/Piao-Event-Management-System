<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Residents Master List</title>
<style>
  @page { margin: 12mm 12mm 16mm 12mm; }
  body { font-family: 'DejaVu Sans', sans-serif; color: #1a1a1a; font-size: 10px; }
  .hdr-table { width: 100%; border-collapse: collapse; }
  .muted { color: #667777; font-size: 9px; }
  .tiny { color: #667777; font-size: 8px; letter-spacing: 1px; text-transform: uppercase; }
  h1.brgy { color: #000000; font-size: 12.5px; margin: 4px 0; text-transform: uppercase; letter-spacing: 0.5px; }
  .system { color: #4FBEB0; font-size: 9px; font-weight: bold; letter-spacing: 2px; text-transform: uppercase; margin-top: 4px; }
  h2.title { color: #005F63; font-size: 15px; text-transform: uppercase; margin: 0; }
  table.list { width: 100%; border-collapse: collapse; margin-top: 8px; table-layout: fixed; }
  table.list thead { display: table-header-group; }
  table.list tr { page-break-inside: avoid; }
  table.list th, table.list td { border: 1px solid #DCEAE5; padding: 7px 7px; font-size: 10.5px; line-height: 1.35; text-align: left; word-wrap: break-word; }
  table.list th { padding: 9px 7px; background: #0A0E1A; color: #EFCA85; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.4px; }
  table.list tr.alt td { background: #EEF4F1; }
  .center { text-align: center !important; }
  .empty { text-align: center; color: #888888; font-style: italic; padding: 14px 0; }
  .sig-wrap { page-break-inside: avoid; margin-top: 40px; }
  .sig-row { width: 100%; border-collapse: collapse; }
  .sig-row td { border: none; text-align: center; font-size: 10px; padding: 0; }
  .sig-row td.sig-label { text-align: left; font-weight: bold; font-size: 10.5px; color: #1a1a1a; }
  .sig-row td.sig-space { height: 42px; vertical-align: bottom; }
  .sig-name { margin: 0 60px; padding-bottom: 3px; text-align: center; font-weight: bold; font-size: 12px; letter-spacing: 0.4px; color: #000000; }
  .sig-line { border-top: 1px solid #667777; padding-top: 4px; margin: 0 60px; font-weight: normal; font-size: 10.5px; color: #1a1a1a; }
  .msg { margin-top: 4px; }
  .msg h4 { color: #000000; font-size: 12px; margin: 12px 0 6px; letter-spacing: 0.5px; }
  .msg p { font-size: 10.5px; line-height: 1.55; text-align: justify; text-indent: 26px; margin: 0 0 7px; color: #1a1a1a; }
  .footer { text-align: center; color: #999; font-size: 8px; margin-top: 10px; }
</style>
</head>
<body>
  @php
    $logoPath = public_path('logo-removebg-preview.jpg');
    $canRenderLogo = is_file($logoPath);
  @endphp
  <table class="hdr-table"><tr>
    <td style="width:86px; vertical-align:middle;">
      @if($canRenderLogo)<img src="{{ $logoPath }}" style="width:70px; height:70px;">@endif
    </td>
    <td style="vertical-align:middle;">
      <p class="tiny" style="margin:0; color:#222222; font-weight:bold;">Republic of the Philippines</p>
      <p class="muted" style="margin:2px 0 0 0; color:#222222; font-size:9.5px;">Province of Zamboanga del Norte, Region IX</p>
      <p class="muted" style="margin:0; color:#222222; font-size:9.5px;">Municipality of President Manuel A. Roxas</p>
      <h1 class="brgy" style="margin:6px 0 4px 0;">Barangay Piao</h1>
      <p class="muted" style="margin:0; color:#222222; font-size:9.5px;">Purok Uno — Barangay Hall, Piao, Roxas, Zamboanga del Norte, 7102</p>
    </td>
    <td style="width:130px; text-align:right; vertical-align:top;">
      <p class="system" style="margin:0;">Piao Connect</p>
      <p class="muted" style="margin:8px 0 0 0;">Generated on</p>
      <p class="muted" style="margin:1px 0 0 0; color:#005F63; font-weight:bold;">{{ $printedOn }}</p>
    </td>
  </tr></table>
  <div style="border-top: 3px solid #005F63; margin-top: 8px;"></div>
  <table class="hdr-table" style="margin-top: 8px;"><tr>
    <td style="vertical-align: bottom;"><h2 class="title">Residents Master List</h2></td>
    <td style="vertical-align: bottom; text-align: right; width: 55%;"><p class="muted" style="margin: 0;">{{ $filterSummary }}</p></td>
  </tr></table>
  <div style="border-top: 1px solid #ddd5ca; margin-top: 6px;"></div>

  @if(!empty($message))
  <div class="msg">
    <h4>I.&nbsp;&nbsp;&nbsp;MESSAGE</h4>
    @foreach($message as $para)
      <p>{{ $para }}</p>
    @endforeach
    <h4 style="margin-top: 14px;">II.&nbsp;&nbsp;&nbsp;RESIDENTS LIST</h4>
  </div>
  @endif

  <table class="list">
    <colgroup>
      @foreach($widths as $w)<col style="width: {{ $w }}%;">@endforeach
    </colgroup>
    <thead>
      <tr>
        @foreach($columns as $i => $col)
          <th class="{{ in_array($i, $centered, true) ? 'center' : '' }}">{{ $col }}</th>
        @endforeach
      </tr>
    </thead>
    <tbody>
      @forelse($rows as $n => $row)
        <tr class="{{ $n % 2 ? 'alt' : '' }}">
          @foreach($row as $i => $cell)
            <td class="{{ in_array($i, $centered, true) ? 'center' : '' }}">{{ $cell !== '' ? $cell : '—' }}</td>
          @endforeach
        </tr>
      @empty
        <tr><td colspan="{{ count($columns) }}" class="empty">No residents match the current filter.</td></tr>
      @endforelse
    </tbody>
  </table>

  <div class="sig-wrap">
    <table class="sig-row" style="border: none;">
      <tr>
        <td class="sig-label" style="width: 50%;">Prepared by:</td>
        <td class="sig-label" style="width: 50%;">Noted:</td>
      </tr>
      <tr>
        <td class="sig-space"><div class="sig-name">{{ $officials['secretary']['name'] ?? '' }}</div></td>
        <td class="sig-space"><div class="sig-name">{{ $officials['captain']['name'] ?? '' }}</div></td>
      </tr>
      <tr>
        <td><div class="sig-line">Barangay Secretary</div></td>
        <td><div class="sig-line">Barangay Captain</div></td>
      </tr>
    </table>
    <p class="footer">Generated via Piao Connect — Barangay Information Management System · {{ $printedOn }}</p>
  </div>
</body>
</html>
