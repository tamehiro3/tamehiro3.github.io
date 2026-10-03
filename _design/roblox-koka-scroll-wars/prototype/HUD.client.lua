--[[
	HUD — 画面の表示(昼夜のタイマー、結界、手持ち、通知)
	置き場所: StarterPlayer > StarterPlayerScripts に LocalScript として貼る
]]

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local player = Players.LocalPlayer
local remotes = ReplicatedStorage:WaitForChild("Remotes")
local StateEvent = remotes:WaitForChild("State")
local NotifyEvent = remotes:WaitForChild("Notify")

local gui = Instance.new("ScreenGui")
gui.Name = "ShinobiHUD"
gui.ResetOnSpawn = false
gui.Parent = player:WaitForChild("PlayerGui")

local function makeText(name, pos, size, textSize, align)
	local label = Instance.new("TextLabel")
	label.Name = name
	label.Position = pos
	label.Size = size
	label.BackgroundColor3 = Color3.fromRGB(20, 20, 30)
	label.BackgroundTransparency = 0.35
	label.TextColor3 = Color3.new(1, 1, 1)
	label.Font = Enum.Font.GothamBold
	label.TextSize = textSize
	label.TextXAlignment = align or Enum.TextXAlignment.Center
	label.TextWrapped = true
	label.Text = ""
	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0, 8)
	corner.Parent = label
	local pad = Instance.new("UIPadding")
	pad.PaddingLeft = UDim.new(0, 10)
	pad.PaddingRight = UDim.new(0, 10)
	pad.Parent = label
	label.Parent = gui
	return label
end

-- 上: 昼夜と残り秒
local phaseLabel = makeText("Phase", UDim2.new(0.5, -140, 0, 10), UDim2.new(0, 280, 0, 44), 24)
-- 上左: 自分の蔵と結界
local vaultLabel = makeText("Vault", UDim2.new(0, 10, 0, 10), UDim2.new(0, 260, 0, 64), 16, Enum.TextXAlignment.Left)
-- 上右: 小判と手持ち
local handLabel = makeText("Hand", UDim2.new(1, -270, 0, 10), UDim2.new(0, 260, 0, 64), 16, Enum.TextXAlignment.Right)
-- 下: 通知の帯
local noteLabel = makeText("Note", UDim2.new(0.5, -260, 1, -110), UDim2.new(0, 520, 0, 52), 18)
noteLabel.BackgroundTransparency = 1
noteLabel.TextTransparency = 1
-- 下右: 操作の説明
local helpLabel = makeText("Help", UDim2.new(1, -270, 1, -200), UDim2.new(0, 260, 0, 80), 13, Enum.TextXAlignment.Left)
helpLabel.Text = "拾う/置く/持ち出す: 近づいて表示されるボタン\n結界: 蔵の戸口そばの青い板\n見張りの黄色い帯に入ると見つかる"

local function fmtTime(sec)
	local m = math.floor(sec / 60)
	local s = sec % 60
	return string.format("%d:%02d", m, s)
end

StateEvent.OnClientEvent:Connect(function(s)
	if s.phase == "day" then
		phaseLabel.Text = "☀ 昼  " .. fmtTime(s.remaining)
		phaseLabel.BackgroundColor3 = Color3.fromRGB(60, 110, 160)
	elseif s.phase == "night" then
		phaseLabel.Text = "🌙 夜(" .. s.night .. "夜目)  " .. fmtTime(s.remaining)
		phaseLabel.BackgroundColor3 = Color3.fromRGB(40, 30, 80)
	else
		phaseLabel.Text = "🔔 夜明けの猶予  " .. s.remaining .. "秒"
		phaseLabel.BackgroundColor3 = Color3.fromRGB(170, 110, 50)
	end

	local barrierText
	if s.barrier > 0 then
		barrierText = "結界 あと " .. s.barrier .. "秒"
	elseif s.barrierCooldown > 0 then
		barrierText = "結界 再使用まで " .. s.barrierCooldown .. "秒"
	else
		barrierText = "結界 使える"
	end
	vaultLabel.Text = s.vaultName .. "\n毎分 " .. s.income .. " 小判\n" .. barrierText

	local stats = player:FindFirstChild("leaderstats")
	local koban = stats and stats:FindFirstChild("小判")
	local kobanText = koban and tostring(koban.Value) or "0"
	local carryText = ""
	if s.carried > 0 then
		carryText = "\n運搬中 " .. s.carried .. " 枚(速度低下)"
	end
	handLabel.Text = "小判 " .. kobanText .. "\n手持ち " .. s.hand .. "/3" .. carryText
end)

local noteToken = 0
NotifyEvent.OnClientEvent:Connect(function(text)
	noteToken = noteToken + 1
	local myToken = noteToken
	noteLabel.Text = text
	noteLabel.BackgroundTransparency = 0.3
	noteLabel.TextTransparency = 0
	task.delay(4, function()
		if noteToken ~= myToken then return end
		for i = 1, 10 do
			noteLabel.BackgroundTransparency = 0.3 + 0.07 * i
			noteLabel.TextTransparency = 0.1 * i
			task.wait(0.05)
		end
		noteLabel.BackgroundTransparency = 1
		noteLabel.TextTransparency = 1
	end)
end)
