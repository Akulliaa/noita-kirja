-- Noita Kirja Tracker
-- Reads where your character is and sends it to your group's Noita Kirja map.
-- It does not change anything in the game.
--
-- How: every few seconds the recent positions are written to a small file in this
-- folder and Windows' built-in curl.exe posts it, hidden, without blocking the game.

local DIR = "mods/noita_kirja_tracker/"
local SAMPLE_FRAMES = 20     -- look at the position 3 times per second
local SEND_FRAMES = 300      -- send at most every 5 seconds
local HEARTBEAT_FRAMES = 1800 -- send the position every 30 s even when standing still
local MIN_MOVE = 48          -- world px between two recorded points

local cfg = nil
local ready = false
local tried = false
local problem = nil
local WORK = DIR           -- where temp files go (replaced by %TEMP% when available)
local connected = false
local reported = false
local awaiting = false
local ffi, CreateProcessA, CloseHandle

local points = {}
local last_x, last_y = nil, nil
local last_send = -100000
local toggle = false

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

local function send(pts)
  local parts = {}
  for i, p in ipairs(pts) do
    parts[i] = string.format("[%d,%d]", math.floor(p[1] + 0.5), math.floor(p[2] + 0.5))
  end
  local body = string.format('{"p_key":"%s","p_points":[%s],"p_radius":%d}',
    cfg.key, table.concat(parts, ","), tonumber(cfg.radius) or 200)
  toggle = not toggle
  local file = WORK .. (toggle and "noita_kirja_out1.json" or "noita_kirja_out2.json")
  local fh = io.open(file, "w")
  if not fh then say("cannot write " .. file); ready = false; return end
  fh:write(body)
  fh:close()
  pcall(os.remove, WORK .. "noita_kirja_response.txt")
  local cmd = string.format(
    'curl.exe -s -m 20 -o "%snoita_kirja_response.txt" -X POST "%s" -H "apikey: %s" -H "Content-Type: application/json" --data-binary "@%s"',
    WORK, cfg.url, cfg.apikey, file)
  if run_hidden(cmd) then
    awaiting = true
  else
    say("could not start curl.exe (Windows 10/11 needed)")
    ready = false
  end
end

-- Read the server answer of the previous send and tell the player once.
local function check_response()
  if not awaiting then return end
  local f = io.open(WORK .. "noita_kirja_response.txt", "r")
  if not f then return end
  local txt = f:read("*a") or ""
  f:close()
  if txt == "" then return end
  awaiting = false
  if txt:match("^%s*%d+%s*$") then
    if not connected then connected = true; say("connected, your map is being revealed") end
  elseif not reported then
    reported = true
    local msg = txt:match('"message"%s*:%s*"([^"]*)"') or txt:sub(1, 120)
    say("server error: " .. msg)
  end
end

local function find_player()
  for _, tag in ipairs({ "player_unit", "polymorphed_player" }) do
    local list = EntityGetWithTag(tag) or {}
    for _, e in ipairs(list) do
      if not EntityHasTag(e, "ew_peer") and not EntityHasTag(e, "ew_client") then return e end
    end
  end
  return nil
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
  check_response()
  local p = find_player()
  if not p then return end
  local x, y = EntityGetTransform(p)
  if not x or not y then return end

  if not last_x or (x - last_x) ^ 2 + (y - last_y) ^ 2 >= MIN_MOVE * MIN_MOVE then
    points[#points + 1] = { x, y }
    last_x, last_y = x, y
    if #points > 150 then table.remove(points, 1) end
  end

  local since = frame - last_send
  if (#points > 0 and since >= SEND_FRAMES) or since >= HEARTBEAT_FRAMES then
    if #points == 0 then points[1] = { x, y } end
    local ok = pcall(send, points)
    points = {}
    last_send = frame
    if not ok then ready = false; GamePrint("Noita Kirja tracker: send error, tracker stopped") end
  end
end
