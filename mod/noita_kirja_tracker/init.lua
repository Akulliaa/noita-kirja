-- Noita Kirja Tracker
-- Reads where your character is and sends it to your group's Noita Kirja map.
-- It does not change anything in the game.
--
-- How: every second (while moving) the recent positions are written to a small file in this
-- folder and Windows' built-in curl.exe posts it, hidden, without blocking the game.

local DIR = "mods/noita_kirja_tracker/"
local SAMPLE_FRAMES = 20     -- look at the position 3 times per second
local SEND_SECONDS = 1       -- send at most every second while moving
local HEARTBEAT_SECONDS = 30 -- send the position every 30 s even when standing still
local ANSWER_TIMEOUT = 12    -- a send without answer after this is considered failed
local LOST_AFTER = 90        -- no successful send for this long = "connection lost" message
local MIN_MOVE = 48          -- world px between two recorded points
local MAX_POINTS = 300
local SLOTS = 4             -- sends that may wait for an answer at the same time

local cfg = nil
local ready = false
local tried = false
local problem = nil
local WORK = DIR           -- where temp files go (replaced by %TEMP% when available)
local connected = false    -- currently getting good answers
local ever_connected = false
local reported = {}        -- error messages already shown
local slots = {}           -- [n] = { at = os.time(), pts = {...} } sends waiting for an answer
local last_ok = nil        -- os.time() of the last good answer
local retry_at = 0         -- os.time() before which we do not try again after a local failure
local ffi, CreateProcessA, CloseHandle

local points = {}
local last_x, last_y = nil, nil
local last_send = -100000

-- Wall clock in seconds. The frame counter can restart (death, new run, multiplayer
-- resync), which used to freeze the tracker until it caught up again.
local function now() return os.time() end

local function say(msg)
  GamePrint("Noita Kirja: " .. msg)
  pcall(function()
    local f = io.open(WORK .. "noita_kirja_log.txt", "a")
    if f then f:write(os.date("%H:%M:%S ") .. msg .. "\n"); f:close() end
  end)
end

local function setup()
  tried = true
  local ok, c = pcall(dofile, DIR .. "config.lua")
  if not ok or type(c) ~= "table" or not c.key or c.key == "" or c.key:find("PASTE") then
    problem = "config.lua missing or without key: download the mod again from the Noita Kirja site."
    return
  end
  cfg = c
  if type(io) ~= "table" or not io.open then
    problem = "enable unsafe mods in the Mods menu."
    return
  end
  local okf, f = pcall(require, "ffi")
  if not okf or not f then
    problem = "enable unsafe mods in the Mods menu."
    return
  end
  ffi = f
  -- Absolute temp folder: works whatever folder Noita was started from
  local okt, tmp = pcall(os.getenv, "TEMP")
  if okt and tmp and tmp ~= "" then WORK = tmp .. "\\" end
  pcall(ffi.cdef, [[
    typedef struct {
      uint32_t cb; void* lpReserved; void* lpDesktop; void* lpTitle;
      uint32_t dwX; uint32_t dwY; uint32_t dwXSize; uint32_t dwYSize;
      uint32_t dwXCountChars; uint32_t dwYCountChars; uint32_t dwFillAttribute; uint32_t dwFlags;
      uint16_t wShowWindow; uint16_t cbReserved2; void* lpReserved2;
      void* hStdInput; void* hStdOutput; void* hStdError;
    } NKT_STARTUPINFOA;
    typedef struct { void* hProcess; void* hThread; uint32_t dwProcessId; uint32_t dwThreadId; } NKT_PROCESS_INFORMATION;
    int CreateProcessA(const char* app, char* cmd, void* pa, void* ta, int inherit, uint32_t flags,
                       void* env, const char* cwd, NKT_STARTUPINFOA* si, NKT_PROCESS_INFORMATION* pi);
    int CloseHandle(void* h);
  ]])
  local okc = pcall(function() CreateProcessA = ffi.C.CreateProcessA; CloseHandle = ffi.C.CloseHandle end)
  if not okc then problem = "could not access Windows (CreateProcessA)."; return end
  ready = true
end

-- Start a hidden process and return immediately.
local function run_hidden(cmd)
  local si = ffi.new("NKT_STARTUPINFOA")
  si.cb = ffi.sizeof(si)
  local pi = ffi.new("NKT_PROCESS_INFORMATION")
  local buf = ffi.new("char[?]", #cmd + 1, cmd)
  local CREATE_NO_WINDOW = 0x08000000
  if CreateProcessA(nil, buf, nil, nil, 0, CREATE_NO_WINDOW, nil, nil, si, pi) ~= 0 then
    CloseHandle(pi.hThread)
    CloseHandle(pi.hProcess)
    return true
  end
  return false
end

-- Put points that could not be delivered back in front of the queue.
local function requeue(pts)
  if not pts or #pts == 0 then return end
  local merged = {}
  for _, p in ipairs(pts) do merged[#merged + 1] = p end
  for _, p in ipairs(points) do merged[#merged + 1] = p end
  while #merged > MAX_POINTS do table.remove(merged, 1) end
  points = merged
end

local function send(pts)
  local parts = {}
  for i, p in ipairs(pts) do
    parts[i] = string.format("[%d,%d]", math.floor(p[1] + 0.5), math.floor(p[2] + 0.5))
  end
  local body = string.format('{"p_key":"%s","p_points":[%s],"p_radius":%d}',
    cfg.key, table.concat(parts, ","), tonumber(cfg.radius) or 200)

  -- Several slots so a slow answer never collides with the next send.
  local slot = nil
  for i = 1, SLOTS do if not slots[i] then slot = i; break end end
  if not slot then return false end -- all still busy: keep the points for later
  local file = WORK .. "noita_kirja_out" .. slot .. ".json"
  local resp = WORK .. "noita_kirja_response" .. slot .. ".txt"
  local fh = io.open(file, "w")
  if not fh then
    if not reported.write then reported.write = true; say("cannot write " .. file .. ", retrying") end
    return false
  end
  fh:write(body)
  fh:close()
  pcall(os.remove, resp)
  local cmd = string.format(
    'curl.exe -s -m 8 -o "%s" -X POST "%s" -H "apikey: %s" -H "Content-Type: application/json" --data-binary "@%s"',
    resp, cfg.url, cfg.apikey, file)
  if run_hidden(cmd) then
    slots[slot] = { at = now(), pts = pts }
    return true
  end
  if not reported.curl then reported.curl = true; say("could not start curl.exe (Windows 10/11 needed), retrying") end
  return false
end

local ok_count, fail_count = 0, 0

local function mark_ok()
  last_ok = now()
  if not connected then
    connected = true
    if ever_connected then say("connection back, tracking again") else say("connected, your map is being revealed") end
    ever_connected = true
  end
end

-- Read the server answers of previous sends.
local function check_responses()
  local t = now()
  for slot = 1, SLOTS do
    local s = slots[slot]
    if s then
      local txt = ""
      local f = io.open(WORK .. "noita_kirja_response" .. slot .. ".txt", "r")
      if f then txt = f:read("*a") or ""; f:close() end
      if txt:match("^%s*%d+%s*$") then
        slots[slot] = nil
        mark_ok()
        ok_count = ok_count + 1
      elseif txt ~= "" and txt:find("}") then
        slots[slot] = nil
        requeue(s.pts)
        local msg = txt:match('"message"%s*:%s*"([^"]*)"') or txt:sub(1, 120)
        if not reported[msg] then reported[msg] = true; say("server error: " .. msg) end
      elseif t - s.at > ANSWER_TIMEOUT then
        slots[slot] = nil -- no answer (no internet, site asleep...): try again later
        requeue(s.pts)
        fail_count = fail_count + 1
      end
    end
  end
  if connected and last_ok and t - last_ok > LOST_AFTER then
    connected = false
    say("connection lost, retrying automatically...")
  end
end

-- Where the player really is.
-- The camera always follows what you control (or watch), so it is the reference.
-- Entities tagged as players are only trusted when they are near the camera:
-- Entangled Worlds can leave player-like entities behind (other players = "ew_peer",
-- dead / polymorphed copies = "ew_notplayer"...) that do not move with you.
local NEAR_CAMERA = 500     -- world px
local log_lines = 0
local last_source = nil
local last_detail_log = 0

local function log(msg)
  if log_lines > 400 then return end -- keep the file small
  log_lines = log_lines + 1
  pcall(function()
    local f = io.open(WORK .. "noita_kirja_log.txt", "a")
    if f then f:write(os.date("%H:%M:%S ") .. msg .. "\n"); f:close() end
  end)
end

local function current_position()
  local okc, cx, cy = pcall(GameGetCameraPos)
  if not okc then cx, cy = nil, nil end
  local best, bx, by, bd = nil, nil, nil, math.huge
  local seen = {}
  for _, tag in ipairs({ "player_unit", "polymorphed_player" }) do
    for _, e in ipairs(EntityGetWithTag(tag) or {}) do
      if not seen[e] and not EntityHasTag(e, "ew_peer") then
        seen[e] = true
        local x, y = EntityGetTransform(e)
        if x and y then
          local d = cx and math.sqrt((x - cx) ^ 2 + (y - cy) ^ 2) or 0
          if not EntityHasTag(e, "ew_notplayer") then d = d - 1 end -- prefer the real player on ties
          if d < bd then best, bx, by, bd = e, x, y, d end
        end
      end
    end
  end

  local source, x, y
  if best and (not cx or bd <= NEAR_CAMERA) then
    source, x, y = "entity " .. best, bx, by
  elseif cx then
    source, x, y = "camera", cx, cy
  else
    return nil
  end

  -- Log when the source changes, plus one line per minute.
  local t = os.time()
  if source ~= last_source or t - last_detail_log >= 60 then
    local extra = ""
    if best then
      extra = string.format(" | nearest player entity %d at %.0f px (tags: %s)", best, math.max(0, bd), tostring(EntityGetTags(best)))
    else
      extra = " | no player entity found"
    end
    log(string.format("position from %s: %.0f, %.0f%s | sends ok %d, failed %d, queued points %d",
      source, x, y, extra, ok_count, fail_count, #points))
    last_source = source
    last_detail_log = t
  end
  return x, y
end

local function start()
  setup()
  if ready then say("tracker active") else GamePrint("Noita Kirja tracker: " .. (problem or "not ready")) end
end

function OnPlayerSpawned(player)
  if not tried then start() end
end

function OnWorldPostUpdate()
  local frame = GameGetFrameNum()
  if frame % SAMPLE_FRAMES ~= 0 then return end
  if not tried and frame > 60 then start() end -- some multiplayer mods skip OnPlayerSpawned
  if not ready then return end
  local ok, err = pcall(function()
    check_responses()
    local x, y = current_position()
    if not x or not y then return end

    if not last_x or (x - last_x) ^ 2 + (y - last_y) ^ 2 >= MIN_MOVE * MIN_MOVE then
      points[#points + 1] = { x, y }
      last_x, last_y = x, y
      if #points > MAX_POINTS then table.remove(points, 1) end
    end

    local t = now()
    if t < last_send then last_send = t end -- clock went back: do not wait forever
    if t < retry_at then return end
    local since = t - last_send
    if (#points > 0 and since >= SEND_SECONDS) or since >= HEARTBEAT_SECONDS then
      if #points == 0 then points[1] = { x, y } end
      -- the server accepts at most 200 points per call: send the oldest 150, keep the rest
      local batch, rest = {}, {}
      for i, p in ipairs(points) do
        if i <= 150 then batch[#batch + 1] = p else rest[#rest + 1] = p end
      end
      points = rest
      last_send = t
      if not send(batch) then
        requeue(batch)
        retry_at = t + 5
      end
    end
  end)
  if not ok then
    -- Never stop for good: note it and try again a bit later.
    retry_at = now() + 5
    if not reported.lua then reported.lua = true; say("tracker error (will retry): " .. tostring(err)) end
  end
end
