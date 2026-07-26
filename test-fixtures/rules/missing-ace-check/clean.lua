RegisterServerEvent('esx_society:setJob')
AddEventHandler('esx_society:setJob', function(source, targetId, grade)
    if IsPlayerAceAllowed(source, 'society.boss') then
        local xPlayer = ESX.GetPlayerFromId(targetId)
        xPlayer.setJob('police', grade)
    end
end)
