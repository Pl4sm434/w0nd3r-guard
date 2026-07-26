local function withdraw(label, amount)
    MySQL.query('UPDATE accounts SET money = money - @amount WHERE label = @label', {
        ['@amount'] = amount,
        ['@label'] = label
    })
end
