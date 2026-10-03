--[[
	ServerMain — 「忍びの蔵と結びの術」(仮) の骨組み(サーバー側)
	置き場所: ServerScriptService に Script として貼る

	このスクリプト1本で、起動時に地図(商店街・蔵通り・風魔の蔵)を自動で組み立て、
	昼夜のサイクル、欠片の湧き、蔵と棚、結界、運搬(持ち出し)と夜明けの返却、
	風魔の影(夜に忍び込むNPC)、見張り(視線で見つける)を動かします。

	設計図 BLUEPRINT.md の「MVPの順番」のうち最初の2段
	(蔵と昼夜と運搬 → 風魔の影NPC)を、数値を小さくして試せる形にしたものです。
	セーブ(DataStore)、術合わせ、推理、課題カード、捕り札、身代わり札はまだありません。

	数値は CONFIG にまとめてあります。テスト中はここだけ触ってください。
]]

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Lighting = game:GetService("Lighting")

-- ============================================================
-- 0. 設定(テストで触るのはここだけ)
-- ============================================================
local CONFIG = {
	DAY_SECONDS = 180,        -- 昼の長さ(秒)。設計図は3分
	NIGHT_SECONDS = 90,       -- 夜の長さ(秒)。設計図は1分30秒
	GRACE_SECONDS = 20,       -- 夜明けの猶予(秒)。この間に自分の蔵の入口に触れると運搬成立

	VAULT_COUNT = 8,          -- 蔵の数 = サーバーの最大人数
	SHELF_SLOTS = 8,          -- 小蔵の棚の枠
	HAND_LIMIT = 3,           -- 手持ちの上限
	CARRY_LIMIT_PER_NIGHT = 3,-- 1晩に持ち出せる枚数

	SPAWN_INTERVAL = 20,      -- 商店街に欠片が湧く間隔(秒)
	SPAWN_MAX = 30,           -- 商店街に同時に置ける欠片の上限

	BARRIER_DURATION = 60,    -- 結界の長さ(秒)
	BARRIER_COOLDOWN = 180,   -- 結界の再使用までの時間(秒)
	BARRIER_CAST = 2,         -- 結界ボタンを押してから張られるまで(秒)
	BARRIER_NEAR = 15,        -- 持ち主がこの距離(スタッド)以内なら結界は普通に持続
	BARRIER_FAR_DECAY = 3,    -- 持ち主が離れていると残り時間がこの倍速で減る

	CARRY_SPEED = 0.7,        -- 運搬中の速度(通常16に対する倍率)
	KAGE_ARRIVE_AT = 45,      -- 風魔の影が夜の何秒目に来るか
	KAGE_SPEED = 20,          -- 風魔の影の移動速度(スタッド/秒)

	GUARD_SPEED = 6,          -- 見張りの歩く速さ
	GUARD_SIGHT = 30,         -- 見張りの視線の届く距離
	GUARD_ANGLE = 45,         -- 視線の半角(度)
	GUARD_HITS_TO_FIND = 10,  -- 0.2秒ごとの判定でこの回数連続で見られたら発見(10回=2秒)

	RARITY = {
		{ name = "白", weight = 60, income = 1,   color = Color3.fromRGB(240, 240, 240) },
		{ name = "青", weight = 25, income = 3,   color = Color3.fromRGB(70, 130, 230) },
		{ name = "紫", weight = 10, income = 10,  color = Color3.fromRGB(160, 80, 220) },
		{ name = "金", weight = 4,  income = 30,  color = Color3.fromRGB(240, 200, 60) },
		{ name = "虹", weight = 1,  income = 100, color = Color3.fromRGB(255, 120, 200) },
	},
}

local WALK_SPEED = 16

-- ============================================================
-- 1. 通信(サーバー → 画面)
-- ============================================================
local remotes = Instance.new("Folder")
remotes.Name = "Remotes"
remotes.Parent = ReplicatedStorage

local StateEvent = Instance.new("RemoteEvent")
StateEvent.Name = "State"
StateEvent.Parent = remotes

local NotifyEvent = Instance.new("RemoteEvent")
NotifyEvent.Name = "Notify"
NotifyEvent.Parent = remotes

local function notify(player, text)
	if player and player.Parent then
		NotifyEvent:FireClient(player, text)
	end
end

local function notifyAll(text)
	NotifyEvent:FireAllClients(text)
end

-- ============================================================
-- 2. 部品を作る道具
-- ============================================================
local function makePart(name, size, cframe, color, parent, props)
	local p = Instance.new("Part")
	p.Name = name
	p.Size = size
	p.CFrame = cframe
	p.Anchored = true
	p.Color = color
	p.Material = Enum.Material.SmoothPlastic
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	if props then
		for k, v in pairs(props) do
			p[k] = v
		end
	end
	p.Parent = parent
	return p
end

local function makeLabel(adornee, text, color, offsetY)
	local gui = Instance.new("BillboardGui")
	gui.Name = "Label"
	gui.Size = UDim2.new(0, 200, 0, 40)
	gui.StudsOffset = Vector3.new(0, offsetY or 3, 0)
	gui.AlwaysOnTop = true
	gui.MaxDistance = 120
	local label = Instance.new("TextLabel")
	label.Size = UDim2.new(1, 0, 1, 0)
	label.BackgroundTransparency = 1
	label.TextScaled = true
	label.Font = Enum.Font.GothamBold
	label.TextColor3 = color or Color3.new(1, 1, 1)
	label.TextStrokeTransparency = 0.3
	label.Text = text
	label.Parent = gui
	gui.Parent = adornee
	return label
end

local function makePrompt(parent, actionText, objectText, distance)
	local prompt = Instance.new("ProximityPrompt")
	prompt.ActionText = actionText
	prompt.ObjectText = objectText or ""
	prompt.HoldDuration = 0
	prompt.MaxActivationDistance = distance or 8
	prompt.RequiresLineOfSight = false
	prompt.Parent = parent
	return prompt
end

local function pickRarity()
	local total = 0
	for _, r in ipairs(CONFIG.RARITY) do
		total = total + r.weight
	end
	local roll = math.random() * total
	for i, r in ipairs(CONFIG.RARITY) do
		roll = roll - r.weight
		if roll <= 0 then
			return i
		end
	end
	return 1
end

local function rarityName(idx)
	return CONFIG.RARITY[idx].name
end

local function getRoot(player)
	local char = player.Character
	if not char then return nil end
	return char:FindFirstChild("HumanoidRootPart")
end

local function getHumanoid(player)
	local char = player.Character
	if not char then return nil end
	return char:FindFirstChildOfClass("Humanoid")
end

-- ============================================================
-- 3. 地図を組み立てる
-- ============================================================
local map = Instance.new("Folder")
map.Name = "Map"
map.Parent = workspace

local fragmentsFolder = Instance.new("Folder")
fragmentsFolder.Name = "Fragments"
fragmentsFolder.Parent = workspace

-- 既にあるスポーン地点を消して、商店街だけから始まるようにする
for _, inst in ipairs(workspace:GetDescendants()) do
	if inst:IsA("SpawnLocation") then
		inst:Destroy()
	end
end

-- 地面
makePart("Ground", Vector3.new(420, 1, 420), CFrame.new(-20, -0.4, -40), Color3.fromRGB(120, 140, 90), map,
	{ Material = Enum.Material.Grass })

-- 商店街(北): 欠片が湧く場所。隠れる箱をいくつか置く
local SHOP = { xMin = -80, xMax = 80, zMin = -150, zMax = -60 }
makePart("ShopStreet", Vector3.new(160, 0.2, 90), CFrame.new(0, 0.2, -105), Color3.fromRGB(190, 170, 130), map)
for i = 1, 8 do
	local x = SHOP.xMin + 20 + (i - 1) * 17
	local z = (i % 2 == 0) and -80 or -130
	makePart("Stall" .. i, Vector3.new(8, 6, 8), CFrame.new(x, 3, z), Color3.fromRGB(150, 90, 60), map,
		{ Material = Enum.Material.Wood })
end

local spawnLoc = Instance.new("SpawnLocation")
spawnLoc.Name = "Spawn"
spawnLoc.Size = Vector3.new(8, 1, 8)
spawnLoc.CFrame = CFrame.new(0, 0.6, -105)
spawnLoc.Anchored = true
spawnLoc.Neutral = true
spawnLoc.Duration = 0
spawnLoc.Color = Color3.fromRGB(220, 220, 220)
spawnLoc.Parent = map

-- 蔵を1軒組み立てる(風魔の蔵も同じ関数で作る)
local function buildVault(index, centerX, centerZ, half, slotCount, displayName)
	local model = Instance.new("Model")
	model.Name = displayName
	model.Parent = map

	local wallColor = Color3.fromRGB(230, 225, 210)
	local wallH = 10
	local size = half * 2
	-- 床
	makePart("Floor", Vector3.new(size, 0.4, size), CFrame.new(centerX, 0.3, centerZ), Color3.fromRGB(110, 80, 60), model,
		{ Material = Enum.Material.WoodPlanks })
	-- 南・東・西の壁
	makePart("WallS", Vector3.new(size, wallH, 1), CFrame.new(centerX, wallH / 2, centerZ + half), wallColor, model)
	makePart("WallE", Vector3.new(1, wallH, size), CFrame.new(centerX + half, wallH / 2, centerZ), wallColor, model)
	makePart("WallW", Vector3.new(1, wallH, size), CFrame.new(centerX - half, wallH / 2, centerZ), wallColor, model)
	-- 北の壁は戸口(幅6)を空ける
	local sideW = (size - 6) / 2
	makePart("WallN1", Vector3.new(sideW, wallH, 1), CFrame.new(centerX - half + sideW / 2, wallH / 2, centerZ - half), wallColor, model)
	makePart("WallN2", Vector3.new(sideW, wallH, 1), CFrame.new(centerX + half - sideW / 2, wallH / 2, centerZ - half), wallColor, model)
	makePart("Lintel", Vector3.new(6, wallH - 8, 1), CFrame.new(centerX, 9, centerZ - half), wallColor, model)
	-- 屋根
	makePart("Roof", Vector3.new(size + 2, 0.6, size + 2), CFrame.new(centerX, wallH + 0.3, centerZ), Color3.fromRGB(60, 60, 70), model,
		{ Material = Enum.Material.Slate })

	-- 棚(南の壁の内側)
	local shelf = makePart("Shelf", Vector3.new(size - 4, 1, 3), CFrame.new(centerX, 3, centerZ + half - 2.5), Color3.fromRGB(90, 60, 40), model,
		{ Material = Enum.Material.Wood })
	local slots = {}
	for s = 1, slotCount do
		local spacing = (size - 4) / slotCount
		local sx = centerX - (size - 4) / 2 + spacing * (s - 0.5)
		local pedestal = makePart("Slot" .. s, Vector3.new(1.5, 0.5, 1.5), CFrame.new(sx, 3.75, centerZ + half - 2.5), Color3.fromRGB(60, 40, 30), model)
		slots[s] = { part = pedestal, frag = nil, visual = nil }
	end

	-- 戸口の判定(夜明けにここに触れると運搬が成立)
	local entrance = makePart("Entrance", Vector3.new(6, 8, 2), CFrame.new(centerX, 4, centerZ - half), Color3.new(1, 1, 1), model,
		{ Transparency = 1, CanCollide = false })

	-- 結界の見た目
	local barrierVisual = makePart("Barrier", Vector3.new(size + 2, wallH + 2, size + 2), CFrame.new(centerX, (wallH + 2) / 2, centerZ),
		Color3.fromRGB(80, 160, 255), model, { Transparency = 1, CanCollide = false, Material = Enum.Material.ForceField })

	-- 名札
	local nameLabel = makeLabel(makePart("Sign", Vector3.new(4, 1, 0.4), CFrame.new(centerX, wallH + 1.5, centerZ - half), Color3.fromRGB(40, 40, 40), model),
		displayName, Color3.new(1, 1, 1), 1.5)

	return {
		index = index,
		model = model,
		centerX = centerX,
		centerZ = centerZ,
		half = half,
		shelf = shelf,
		slots = slots,
		entrance = entrance,
		barrierVisual = barrierVisual,
		nameLabel = nameLabel,
		barrierButton = nil,
		owner = nil,
		barrierRemaining = 0,
		barrierCooldownUntil = 0,
		casting = false,
	}
end

-- 蔵通り(中央): 8軒
local vaults = {}
for i = 1, CONFIG.VAULT_COUNT do
	local cx = -105 + 30 * (i - 1)
	local v = buildVault(i, cx, 0, 10, CONFIG.SHELF_SLOTS, "空き蔵 " .. i)
	-- 結界ボタン(西の壁の内側、戸口のそば)
	local button = makePart("BarrierButton", Vector3.new(0.5, 2, 2), CFrame.new(cx - 9.2, 3, -6), Color3.fromRGB(80, 160, 255), v.model,
		{ Material = Enum.Material.Neon })
	v.barrierButton = button
	makeLabel(button, "結界", Color3.fromRGB(150, 200, 255), 2)
	vaults[i] = v
end

-- 風魔の蔵(西): 持ち出せる蔵。見張りがいる
local KAGE_HOME = buildVault(0, -160, 0, 15, 4, "風魔の蔵")
KAGE_HOME.nameLabel.TextColor3 = Color3.fromRGB(255, 120, 120)
makePart("KageDoorMat", Vector3.new(8, 0.3, 6), CFrame.new(-160, 0.5, -19), Color3.fromRGB(80, 40, 40), map)

-- ============================================================
-- 4. プレイヤーの状態
-- ============================================================
-- playerState[userId] = { vault = vault or nil, hand = {frag...}, carriedTonight = n, kobanAcc = 小判(小数) }
-- frag = { rarity = 1..5, omamori = bool, from = nil | "vault:<index>" | "kage" }
local playerState = {}

local function stateOf(player)
	return playerState[player.UserId]
end

local function countCarried(st)
	local n = 0
	for _, f in ipairs(st.hand) do
		if f.from ~= nil then
			n = n + 1
		end
	end
	return n
end

local function applyCarrySpeed(player)
	local st = stateOf(player)
	local hum = getHumanoid(player)
	if not st or not hum then return end
	if countCarried(st) > 0 then
		hum.WalkSpeed = WALK_SPEED * CONFIG.CARRY_SPEED
	else
		hum.WalkSpeed = WALK_SPEED
	end
end

local function isInsideVault(v, position)
	return math.abs(position.X - v.centerX) <= v.half and math.abs(position.Z - v.centerZ) <= v.half
end

local function intruderInside(v)
	for _, player in ipairs(Players:GetPlayers()) do
		if player ~= v.owner then
			local root = getRoot(player)
			if root and isInsideVault(v, root.Position) then
				return true
			end
		end
	end
	return false
end

-- ============================================================
-- 5. 棚の欠片(見た目と出し入れ)
-- ============================================================
local function setSlotFragment(v, slotIndex, frag)
	local slot = v.slots[slotIndex]
	if slot.visual then
		slot.visual:Destroy()
		slot.visual = nil
	end
	slot.frag = frag
	if frag then
		local r = CONFIG.RARITY[frag.rarity]
		local visual = makePart("Fragment", Vector3.new(1.2, 1.2, 1.2),
			slot.part.CFrame * CFrame.new(0, 1, 0) * CFrame.Angles(math.rad(45), math.rad(45), 0),
			r.color, v.model, { Material = Enum.Material.Neon, CanCollide = false })
		local text = r.name
		if frag.omamori then
			text = r.name .. "(お守り)"
		elseif frag.victimUserId then
			text = r.name .. "(縄)"
		end
		makeLabel(visual, text, r.color, 1.5)
		slot.visual = visual
	end
end

local function findFreeSlot(v)
	for i, slot in ipairs(v.slots) do
		if slot.frag == nil then
			return i
		end
	end
	return nil
end

local function findTakeableSlot(v)
	-- 風魔の影が狙う棚: お守り以外で一番レアなもの
	local best, bestRarity = nil, 0
	for i, slot in ipairs(v.slots) do
		if slot.frag and not slot.frag.omamori and slot.frag.rarity > bestRarity then
			best, bestRarity = i, slot.frag.rarity
		end
	end
	return best
end

local function shelfIncomePerMinute(v)
	local sum = 0
	for _, slot in ipairs(v.slots) do
		if slot.frag then
			sum = sum + CONFIG.RARITY[slot.frag.rarity].income
		end
	end
	return sum
end

local function clearShelf(v)
	for i = 1, #v.slots do
		setSlotFragment(v, i, nil)
	end
end

-- ============================================================
-- 6. 昼夜
-- ============================================================
local phase = "day"          -- "day" | "night" | "grace"
local phaseRemaining = CONFIG.DAY_SECONDS
local nightCount = 0

local function returnCarriedToOrigin(player, st)
	-- 猶予内に成立しなかった運搬を元の棚へ戻す
	local kept = {}
	for _, f in ipairs(st.hand) do
		if f.from == nil then
			table.insert(kept, f)
		elseif f.from == "kage" then
			local s = findFreeSlot(KAGE_HOME)
			f.from = nil
			if s then setSlotFragment(KAGE_HOME, s, f) end
		else
			local idx = tonumber(string.sub(f.from, 7))
			local origin = vaults[idx]
			f.from = nil
			if origin and origin.owner then
				local s = findFreeSlot(origin)
				if s then
					setSlotFragment(origin, s, f)
				end
			end
			-- 持ち主がもういない蔵の欠片は消える(ログアウト中は蔵が消える、の規則)
		end
	end
	st.hand = kept
	applyCarrySpeed(player)
end

local function autoPlaceOwnHand(player, st)
	-- 自分で拾った欠片を、夜の終わりに自分の棚の空きへ自動で置く
	if not st.vault then return end
	local rest = {}
	for _, f in ipairs(st.hand) do
		local s = findFreeSlot(st.vault)
		if s and f.from == nil then
			setSlotFragment(st.vault, s, f)
		else
			table.insert(rest, f)
		end
	end
	st.hand = rest
end

local function onDawn()
	-- 夜 → 猶予
	phase = "grace"
	phaseRemaining = CONFIG.GRACE_SECONDS
	notifyAll("夜明け。鐘が鳴るまでに自分の蔵の入口に触れると、持ち出した欠片が自分のものになる")
end

local function onDayStart()
	-- 猶予 → 昼
	for _, player in ipairs(Players:GetPlayers()) do
		local st = stateOf(player)
		if st then
			returnCarriedToOrigin(player, st)
			autoPlaceOwnHand(player, st)
		end
	end
	phase = "day"
	phaseRemaining = CONFIG.DAY_SECONDS
	notifyAll("朝になった。昼のあいだは誰にも持ち出されない")
end

local function onNightStart()
	phase = "night"
	phaseRemaining = CONFIG.NIGHT_SECONDS
	nightCount = nightCount + 1
	for _, player in ipairs(Players:GetPlayers()) do
		local st = stateOf(player)
		if st then
			st.carriedTonight = 0
		end
	end
	-- 風魔の蔵に青を2枚置く
	for s = 1, 2 do
		if KAGE_HOME.slots[s].frag == nil then
			setSlotFragment(KAGE_HOME, s, { rarity = 2, omamori = false, from = nil })
		end
	end
	notifyAll("夜になった(" .. nightCount .. "夜目)。蔵を守るか、忍び込むか")
end

-- ============================================================
-- 7. 欠片を拾う(商店街)
-- ============================================================
local function spawnWorldFragment()
	if #fragmentsFolder:GetChildren() >= CONFIG.SPAWN_MAX then return end
	local rarity = pickRarity()
	local r = CONFIG.RARITY[rarity]
	local x = math.random(SHOP.xMin + 5, SHOP.xMax - 5)
	local z = math.random(SHOP.zMin + 5, SHOP.zMax - 5)
	local part = makePart("Fragment", Vector3.new(1.2, 1.2, 1.2),
		CFrame.new(x, 1.5, z) * CFrame.Angles(math.rad(45), math.rad(45), 0),
		r.color, fragmentsFolder, { Material = Enum.Material.Neon, CanCollide = false })
	makeLabel(part, r.name .. "の欠片", r.color, 1.5)
	local prompt = makePrompt(part, "拾う", r.name .. "の欠片", 8)
	prompt.Triggered:Connect(function(player)
		local st = stateOf(player)
		if not st or not part.Parent then return end
		if #st.hand >= CONFIG.HAND_LIMIT then
			notify(player, "手がいっぱい。蔵に置いてから")
			return
		end
		part:Destroy()
		table.insert(st.hand, { rarity = rarity, omamori = false, from = nil })
		notify(player, r.name .. "の欠片を拾った(手持ち " .. #st.hand .. "/" .. CONFIG.HAND_LIMIT .. ")")
	end)
end

-- ============================================================
-- 8. 棚の操作(置く・持ち出す・取り返す)
-- ============================================================
local function onShelfTriggered(v, slotIndex, player)
	local st = stateOf(player)
	if not st then return end
	local slot = v.slots[slotIndex]

	if v.owner == player then
		-- 自分の棚: 置く
		if slot.frag then
			notify(player, "ここにはもう欠片がある")
			return
		end
		if #st.hand == 0 then
			notify(player, "手に欠片がない。商店街で拾おう")
			return
		end
		local f = table.remove(st.hand, 1)
		f.from = nil
		setSlotFragment(v, slotIndex, f)
		applyCarrySpeed(player)
		notify(player, rarityName(f.rarity) .. "の欠片を棚に置いた。毎分 " .. shelfIncomePerMinute(v) .. " 小判")
		return
	end

	-- 他人の棚 or 風魔の蔵: 持ち出す
	if not slot.frag then
		notify(player, "空の枠")
		return
	end
	if slot.frag.victimUserId then
		-- 縄で結ばれた欠片: 被害者本人だけが取り返せる
		if slot.frag.victimUserId ~= player.UserId then
			notify(player, "縄で結ばれている。持ち主にしか外せない")
			return
		end
		if #st.hand >= CONFIG.HAND_LIMIT then
			notify(player, "手がいっぱい")
			return
		end
		local f = slot.frag
		setSlotFragment(v, slotIndex, nil)
		f.victimUserId = nil
		f.from = nil
		table.insert(st.hand, f)
		notify(player, rarityName(f.rarity) .. "の欠片を取り返した。朝になると自分の棚に戻る")
		return
	end
	if phase ~= "night" then
		notify(player, "持ち出せるのは夜だけ")
		return
	end
	if v.owner and v.barrierRemaining > 0 then
		notify(player, "結界に阻まれた")
		return
	end
	if slot.frag.omamori then
		notify(player, "お守りの欠片は持ち出せない")
		return
	end
	if #st.hand >= CONFIG.HAND_LIMIT then
		notify(player, "手がいっぱい")
		return
	end
	if st.carriedTonight >= CONFIG.CARRY_LIMIT_PER_NIGHT then
		notify(player, "今夜はもう持ち出せない(1晩 " .. CONFIG.CARRY_LIMIT_PER_NIGHT .. " 枚まで)")
		return
	end
	local f = slot.frag
	setSlotFragment(v, slotIndex, nil)
	if v.index == 0 then
		f.from = "kage"
	else
		f.from = "vault:" .. v.index
	end
	st.carriedTonight = st.carriedTonight + 1
	table.insert(st.hand, f)
	applyCarrySpeed(player)
	notify(player, rarityName(f.rarity) .. "の欠片を持ち出した。夜明けの鐘までに自分の蔵の入口へ(速度が落ちる)")
	if v.owner then
		notify(v.owner, "⚠ " .. rarityName(f.rarity) .. "の欠片が持ち出された!")
	end
end

for _, v in ipairs(vaults) do
	for s, slot in ipairs(v.slots) do
		local prompt = makePrompt(slot.part, "棚", "枠 " .. s, 6)
		prompt.Triggered:Connect(function(player)
			onShelfTriggered(v, s, player)
		end)
	end
end
for s, slot in ipairs(KAGE_HOME.slots) do
	local prompt = makePrompt(slot.part, "棚", "風魔の枠 " .. s, 6)
	prompt.Triggered:Connect(function(player)
		onShelfTriggered(KAGE_HOME, s, player)
	end)
end

-- 戸口: 猶予中に自分の蔵へ触れると運搬が成立
for _, v in ipairs(vaults) do
	v.entrance.Touched:Connect(function(hit)
		local char = hit.Parent
		local player = char and Players:GetPlayerFromCharacter(char)
		if not player or v.owner ~= player then return end
		if phase ~= "grace" then return end
		local st = stateOf(player)
		if not st then return end
		-- 運搬中の欠片を、空き枠がある分だけその場で棚に置く。枠が足りない分は手持ちのまま(猶予が切れると元へ戻る)
		local placed = 0
		local rest = {}
		for _, f in ipairs(st.hand) do
			local s = (f.from ~= nil) and findFreeSlot(v) or nil
			if s then
				f.from = nil
				setSlotFragment(v, s, f)
				placed = placed + 1
			else
				table.insert(rest, f)
			end
		end
		if placed > 0 then
			st.hand = rest
			applyCarrySpeed(player)
			notify(player, "運搬成立! " .. placed .. " 枚が自分の棚に入った")
		end
	end)
end

-- ============================================================
-- 9. 結界
-- ============================================================
for _, v in ipairs(vaults) do
	local prompt = makePrompt(v.barrierButton, "結界を張る", "", 8)
	prompt.Triggered:Connect(function(player)
		if v.owner ~= player then
			notify(player, "自分の蔵の結界しか張れない")
			return
		end
		if v.casting or v.barrierRemaining > 0 then
			notify(player, "結界はもう張られている")
			return
		end
		local now = os.clock()
		if now < v.barrierCooldownUntil then
			notify(player, "結界はあと " .. math.ceil(v.barrierCooldownUntil - now) .. " 秒で使える")
			return
		end
		if intruderInside(v) then
			notify(player, "蔵の中に誰かいる。結界は先手で張るもの")
			return
		end
		v.casting = true
		notify(player, "結界を詠唱中…")
		task.delay(CONFIG.BARRIER_CAST, function()
			v.casting = false
			if v.owner ~= player then return end
			if intruderInside(v) then
				notify(player, "詠唱中に侵入された。結界は張れなかった")
				return
			end
			v.barrierRemaining = CONFIG.BARRIER_DURATION
			v.barrierCooldownUntil = os.clock() + CONFIG.BARRIER_COOLDOWN
			notify(player, "結界を張った(" .. CONFIG.BARRIER_DURATION .. "秒。離れると早く切れる)")
		end)
	end)
end

-- ============================================================
-- 10. 風魔の影(夜に忍び込むNPC。壁をすり抜ける影)
-- ============================================================
local kage = makePart("KageNoKage", Vector3.new(2, 5, 2), CFrame.new(-160, 3, 5), Color3.fromRGB(30, 30, 45), map,
	{ Material = Enum.Material.Neon, CanCollide = false, Transparency = 0.3 })
local kageLabel = makeLabel(kage, "風魔の影", Color3.fromRGB(255, 120, 120), 3.5)
local kageHomePos = Vector3.new(-160, 3, 5)
local kageBusy = false

local function kageMoveTo(target)
	while (kage.Position - target).Magnitude > 0.5 do
		local dt = RunService.Heartbeat:Wait()
		local dir = (target - kage.Position)
		local step = math.min(dir.Magnitude, CONFIG.KAGE_SPEED * dt)
		kage.CFrame = CFrame.new(kage.Position + dir.Unit * step)
	end
end

local function kageRaid()
	if kageBusy then return end
	kageBusy = true
	-- 狙う蔵: 持ち主がいて、結界がなく、持ち出せる欠片がある蔵
	local candidates = {}
	for _, v in ipairs(vaults) do
		if v.owner and v.barrierRemaining <= 0 and findTakeableSlot(v) then
			table.insert(candidates, v)
		end
	end
	if #candidates == 0 then
		kageBusy = false
		return
	end
	local target = candidates[math.random(1, #candidates)]
	kageLabel.Text = "風魔の影(狙い: " .. target.nameLabel.Text .. ")"
	kageMoveTo(Vector3.new(target.centerX, 3, target.centerZ - target.half - 3))
	if target.owner then
		notify(target.owner, "⚠ 風魔の影が蔵の前に来た! 結界を!")
	end
	task.wait(3)
	kageMoveTo(Vector3.new(target.centerX, 3, target.centerZ + target.half - 5))
	task.wait(1)
	local stolen = nil
	if target.owner and target.barrierRemaining <= 0 and phase == "night" then
		local s = findTakeableSlot(target)
		if s then
			stolen = target.slots[s].frag
			setSlotFragment(target, s, nil)
			stolen.victimUserId = target.owner.UserId
			notify(target.owner, "風魔の影が " .. rarityName(stolen.rarity) .. " の欠片を持ち出した! 西の風魔の蔵へ取り返しに行こう")
		end
	elseif target.owner then
		notify(target.owner, "結界が風魔の影を退けた")
	end
	kageLabel.Text = "風魔の影"
	kageMoveTo(kageHomePos)
	if stolen then
		local s = nil
		for i = 3, #KAGE_HOME.slots do
			if KAGE_HOME.slots[i].frag == nil then s = i break end
		end
		if not s then s = findFreeSlot(KAGE_HOME) end
		if s then
			setSlotFragment(KAGE_HOME, s, stolen)
		end
	end
	kageBusy = false
end

-- ============================================================
-- 11. 見張り(風魔の蔵の中を往復し、視線で見つける)
-- ============================================================
local guard = makePart("Guard", Vector3.new(2, 5, 2), CFrame.new(-170, 3, -5), Color3.fromRGB(120, 40, 40), map,
	{ CanCollide = false })
makeLabel(guard, "見張り", Color3.fromRGB(255, 180, 180), 3.5)
local sight = makePart("Sight", Vector3.new(20, 0.2, CONFIG.GUARD_SIGHT), CFrame.new(), Color3.fromRGB(255, 230, 80), map,
	{ Transparency = 0.8, CanCollide = false })
local guardA = Vector3.new(-172, 3, -5)
local guardB = Vector3.new(-148, 3, -5)
local guardTarget = guardB
local guardHits = {}

local rayParams = RaycastParams.new()
rayParams.FilterType = Enum.RaycastFilterType.Exclude
rayParams.FilterDescendantsInstances = { guard, sight, kage, fragmentsFolder }

local function guardFound(player)
	local root = getRoot(player)
	if root then
		root.CFrame = CFrame.new(-160, 3, -22)
	end
	local st = stateOf(player)
	if st then
		-- 風魔の蔵から持ち出していた欠片は棚に戻る
		local kept = {}
		for _, f in ipairs(st.hand) do
			if f.from == "kage" then
				f.from = nil
				local s = findFreeSlot(KAGE_HOME)
				if s then setSlotFragment(KAGE_HOME, s, f) end
			else
				table.insert(kept, f)
			end
		end
		st.hand = kept
		applyCarrySpeed(player)
	end
	notify(player, "見つかった! 入口に戻された(体力も所持品も減らない)")
end

task.spawn(function()
	local acc = 0
	while true do
		local dt = RunService.Heartbeat:Wait()
		-- 往復
		local dir = guardTarget - guard.Position
		if dir.Magnitude < 0.5 then
			guardTarget = (guardTarget == guardA) and guardB or guardA
		else
			local step = math.min(dir.Magnitude, CONFIG.GUARD_SPEED * dt)
			guard.CFrame = CFrame.lookAt(guard.Position + dir.Unit * step, guard.Position + dir.Unit * 10)
		end
		-- 視線の見た目(前方に伸びる板)
		sight.CFrame = guard.CFrame * CFrame.new(0, -2, -CONFIG.GUARD_SIGHT / 2)
		-- 0.2秒ごとの判定
		acc = acc + dt
		if acc >= 0.2 then
			acc = 0
			for _, player in ipairs(Players:GetPlayers()) do
				local root = getRoot(player)
				local seen = false
				if root and isInsideVault(KAGE_HOME, root.Position) then
					local toPlayer = root.Position - guard.Position
					local dist = toPlayer.Magnitude
					if dist <= CONFIG.GUARD_SIGHT then
						local forward = guard.CFrame.LookVector
						local cos = forward:Dot(toPlayer.Unit)
						if cos >= math.cos(math.rad(CONFIG.GUARD_ANGLE)) then
							local result = workspace:Raycast(guard.Position, toPlayer, rayParams)
							if result and result.Instance:IsDescendantOf(player.Character) then
								seen = true
							end
						end
					end
				end
				if seen then
					guardHits[player.UserId] = (guardHits[player.UserId] or 0) + 1
					if guardHits[player.UserId] >= CONFIG.GUARD_HITS_TO_FIND then
						guardHits[player.UserId] = 0
						guardFound(player)
					end
				else
					guardHits[player.UserId] = 0
				end
			end
		end
	end
end)

-- ============================================================
-- 12. プレイヤーの出入り
-- ============================================================
local function assignVault(player)
	for _, v in ipairs(vaults) do
		if v.owner == nil then
			v.owner = player
			v.nameLabel.Text = player.DisplayName .. " の蔵"
			v.barrierRemaining = 0
			v.barrierCooldownUntil = 0
			clearShelf(v)
			-- お守りの欠片(永久に持ち出されない)
			setSlotFragment(v, 1, { rarity = 1, omamori = true, from = nil })
			return v
		end
	end
	return nil
end

Players.PlayerAdded:Connect(function(player)
	local st = { vault = nil, hand = {}, carriedTonight = 0, kobanAcc = 0 }
	playerState[player.UserId] = st

	local stats = Instance.new("Folder")
	stats.Name = "leaderstats"
	stats.Parent = player
	local koban = Instance.new("IntValue")
	koban.Name = "小判"
	koban.Value = 0
	koban.Parent = stats

	st.vault = assignVault(player)

	local function onCharacter()
		task.wait(0.5)
		applyCarrySpeed(player)
		if st.vault then
			notify(player, "あなたの蔵は「" .. st.vault.nameLabel.Text .. "」。棚にお守りの欠片がある。商店街(北)で欠片を拾って棚に置こう")
		else
			notify(player, "蔵が満員です(見学モード)。欠片は拾えます")
		end
	end
	player.CharacterAdded:Connect(onCharacter)
	if player.Character then
		task.spawn(onCharacter)
	end
end)

Players.PlayerRemoving:Connect(function(player)
	local st = stateOf(player)
	if st and st.vault then
		local v = st.vault
		v.owner = nil
		v.nameLabel.Text = "空き蔵 " .. v.index
		v.barrierRemaining = 0
		clearShelf(v)
	end
	playerState[player.UserId] = nil
	guardHits[player.UserId] = nil
end)

-- ============================================================
-- 13. 時間を進めるループ
-- ============================================================
-- 昼夜と結界(毎フレーム)
RunService.Heartbeat:Connect(function(dt)
	phaseRemaining = phaseRemaining - dt
	if phaseRemaining <= 0 then
		if phase == "day" then
			onNightStart()
		elseif phase == "night" then
			onDawn()
		else
			onDayStart()
		end
	end
	-- 空の明るさ: 昼は10時→18時へ進み、夜は0時、猶予は6時(夜明け)
	local targetClock
	if phase == "day" then
		targetClock = 10 + (1 - phaseRemaining / CONFIG.DAY_SECONDS) * 8
	elseif phase == "night" then
		targetClock = 0
	else
		targetClock = 6
	end
	Lighting.ClockTime = Lighting.ClockTime + (targetClock - Lighting.ClockTime) * math.min(1, dt * 0.5)

	for _, v in ipairs(vaults) do
		if v.barrierRemaining > 0 then
			local drain = CONFIG.BARRIER_FAR_DECAY
			local root = v.owner and getRoot(v.owner)
			if root then
				local d = (root.Position - Vector3.new(v.centerX, root.Position.Y, v.centerZ)).Magnitude
				if d <= CONFIG.BARRIER_NEAR then
					drain = 1
				end
			end
			v.barrierRemaining = v.barrierRemaining - dt * drain
			if v.barrierRemaining <= 0 then
				v.barrierRemaining = 0
				if v.owner then notify(v.owner, "結界が消えた") end
			end
			v.barrierVisual.Transparency = 0.55
		else
			v.barrierVisual.Transparency = 1
		end
	end
end)

-- 収入(毎秒、毎分収入の1/60ずつ)
task.spawn(function()
	while true do
		task.wait(1)
		for _, player in ipairs(Players:GetPlayers()) do
			local st = stateOf(player)
			if st and st.vault then
				st.kobanAcc = st.kobanAcc + shelfIncomePerMinute(st.vault) / 60
				local stats = player:FindFirstChild("leaderstats")
				local koban = stats and stats:FindFirstChild("小判")
				if koban then
					koban.Value = math.floor(st.kobanAcc)
				end
			end
		end
	end
end)

-- 欠片の湧き
task.spawn(function()
	for _ = 1, 10 do
		spawnWorldFragment()
	end
	while true do
		task.wait(CONFIG.SPAWN_INTERVAL)
		spawnWorldFragment()
	end
end)

-- 風魔の影の出番
task.spawn(function()
	local lastNight = 0
	while true do
		task.wait(0.5)
		if phase == "night" and nightCount ~= lastNight
			and (CONFIG.NIGHT_SECONDS - phaseRemaining) >= CONFIG.KAGE_ARRIVE_AT then
			lastNight = nightCount
			task.spawn(kageRaid)
		end
	end
end)

-- 画面への状態送信(0.5秒ごと)
task.spawn(function()
	while true do
		task.wait(0.5)
		for _, player in ipairs(Players:GetPlayers()) do
			local st = stateOf(player)
			if st then
				StateEvent:FireClient(player, {
					phase = phase,
					remaining = math.max(0, math.ceil(phaseRemaining)),
					night = nightCount,
					barrier = st.vault and math.ceil(st.vault.barrierRemaining) or 0,
					barrierCooldown = st.vault and math.max(0, math.ceil(st.vault.barrierCooldownUntil - os.clock())) or 0,
					hand = #st.hand,
					carried = countCarried(st),
					income = st.vault and shelfIncomePerMinute(st.vault) or 0,
					vaultName = st.vault and st.vault.nameLabel.Text or "(蔵なし)",
				})
			end
		end
	end
end)

print("[ServerMain] 骨組みを起動した。昼 " .. CONFIG.DAY_SECONDS .. "秒 / 夜 " .. CONFIG.NIGHT_SECONDS .. "秒")
