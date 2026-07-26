exports('setSocietyMoney', function(society, amount)
    TriggerEvent('esx_society:internalSetMoney', society, amount)
    Society.setMoney(society, amount)
end)
