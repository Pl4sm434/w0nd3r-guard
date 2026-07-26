RegisterServerEvent('esx_society:setJob')
AddEventHandler('esx_society:setJob', function(source, targetGrade)
    local xPlayer = ESX.GetPlayerFromId(source)
    if xPlayer.job.grade >= targetGrade then
        xPlayer.setJob('police', targetGrade)
    end
end)
