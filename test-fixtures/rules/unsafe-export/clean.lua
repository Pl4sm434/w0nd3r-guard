exports('setSocietyMoney', function(society, amount)
    local resource = GetInvokingResource()
    if resource ~= 'wonder_pvp' then return end
    Society.setMoney(society, amount)
end)
