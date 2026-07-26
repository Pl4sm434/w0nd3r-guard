RegisterServerEvent('esx_society:setJob')
AddEventHandler('esx_society:setJob', function(playerId, job, grade)
    local xPlayer = ESX.GetPlayerFromId(playerId)
    xPlayer.setJob(job, grade)
end)

local function helper()
    RegisterServerEvent('esx_society:withdraw')
end

AddEventHandler('esx_society:withdraw', function(amount)
    print('withdraw', amount)
end)
