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
local problem = nil
local ffi, CreateProcessA, CloseHandle

local points = {}
local last_x, last_y = nil, nil
local last_send = -100000
local toggle = false

local function setup()
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
  local file = DIR .. (toggle and "out1.json" or "out2.json")
  local fh = io.open(file, "w")
  if not fh then return end
  fh:write(body)
  fh:close()
  local cmd = string.format(
    'curl.exe -s -m 20 -o "%slast_response.txt" -X POST "%s" -H "apikey: %s" -H "Content-Type: application/json" --data-binary "@%s"',
    DIR, cfg.url, cfg.apikey, file)
  run_hidden(cmd)
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

function OnPlayerSpawned(player)
  setup()
  if ready then
    GamePrint("Noita Kirja: tracker active")
  else
    GamePrint("Noita Kirja tracker: " .. (problem or "not ready"))
  end
end

function OnWorldPostUpdate()
  if not ready then return end
  local frame = GameGetFrameNum()
  if frame % SAMPLE_FRAMES ~= 0 then return end
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
