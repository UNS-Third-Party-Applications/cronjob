function safeParseInt(value) {
  if (/^\d+$/.test(value)) {
    return Number(value)
  } else {
    return NaN
  }
}

function isWildcard(value) {
  return value === '*'
}

function isQuestionMark(value) {
  return value === '?'
}

function isInRange(value, start, stop) {
  return value >= start && value <= stop
}

function isValidRange(value, start, stop) {
  const sides = value.split('-')
  switch (sides.length) {
    case 1:
      return isWildcard(value) || isInRange(safeParseInt(value), start, stop)
    case 2:
      const [small, big] = sides.map((side) => safeParseInt(side))
      return (
        small <= big &&
        isInRange(small, start, stop) &&
        isInRange(big, start, stop)
      )
    default:
      return false
  }
}

function isValidStep(value) {
  return (
    value === undefined ||
    (value.search(/[^\d]/) === -1 && safeParseInt(value) > 0)
  )
}

function validateForRange(value, start, stop) {
  if (value.search(/[^\d-,\/*]/) !== -1) {
    return false
  }

  const list = value.split(',')
  return list.every((condition) => {
    const splits = condition.split('/')
    // Prevents `*/ * * * *` from being accepted.
    if (condition.trim().endsWith('/')) {
      return false
    }

    // Prevents `*/*/* * * * *` from being accepted
    if (splits.length > 2) {
      return false
    }

    // If we don't have a `/`, right will be undefined which is considered a valid step if we don't a `/`.
    const [left, right] = splits
    return isValidRange(left, start, stop) && isValidStep(right)
  })
}

function hasValidSeconds(seconds) {
  return validateForRange(seconds, 0, 59)
}

function hasValidMinutes(minutes) {
  return validateForRange(minutes, 0, 59)
}

function hasValidHours(hours) {
  return validateForRange(hours, 0, 23)
}

function hasValidDays(days, allowBlankDay) {
  return (
    (allowBlankDay && isQuestionMark(days)) || validateForRange(days, 1, 31)
  )
}

function hasValidMonths(months, alias) {
  const monthAlias = {
    jan: '1',
    feb: '2',
    mar: '3',
    apr: '4',
    may: '5',
    jun: '6',
    jul: '7',
    aug: '8',
    sep: '9',
    oct: '10',
    nov: '11',
    dec: '12',
  }
  // Prevents alias to be used as steps
  if (months.search(/\/[a-zA-Z]/) !== -1) {
    return false
  }

  if (alias) {
    const remappedMonths = months
      .toLowerCase()
      .replace(/[a-z]{3}/g, (match) => {
        return monthAlias[match] === undefined ? match : monthAlias[match]
      })
    // If any invalid alias was used, it won't pass the other checks as there will be non-numeric values in the months
    return validateForRange(remappedMonths, 1, 12)
  }

  return validateForRange(months, 1, 12)
}

function hasValidWeekdays(weekdays, options) {
  const { allowBlankDay, alias, allowSevenAsSunday, allowNthWeekdayOfMonth } =
    options
  // If there is a question mark, checks if the allowBlankDay flag is set
  if (allowBlankDay && isQuestionMark(weekdays)) {
    return true
  } else if (!allowBlankDay && isQuestionMark(weekdays)) {
    return false
  }

  // Prevents alias to be used as steps
  if (weekdays.search(/\/[a-zA-Z]/) !== -1) {
    return false
  }

  const weekdaysAlias = {
    sun: '0',
    mon: '1',
    tue: '2',
    wed: '3',
    thu: '4',
    fri: '5',
    sat: '6',
  }

  const remappedWeekdays = alias
    ? weekdays.toLowerCase().replace(/[a-z]{3}/g, (match) => {
        return weekdaysAlias[match] === undefined ? match : weekdaysAlias[match]
      })
    : weekdays
  const maxWeekdayNum = allowSevenAsSunday ? 7 : 6

  const splitByHash = remappedWeekdays.split('#')
  if (allowNthWeekdayOfMonth && splitByHash.length >= 2) {
    // see https://github.com/Airfooox/cron-validate/blob/b95aae1f3a44ad89dbfc7d1a7fca63f3b697aa14/src/helper.ts#L139
    // and https://www.quartz-scheduler.org/documentation/quartz-2.2.2/tutorials/crontrigger.html#special-characters
    const [weekday, occurrence, ...leftOvers] = splitByHash
    if (leftOvers.length !== 0) {
      return false
    }

    return (
      isInRange(safeParseInt(occurrence), 1, 5) &&
      isInRange(safeParseInt(weekday), 0, maxWeekdayNum)
    )
  }

  return validateForRange(remappedWeekdays, 0, maxWeekdayNum)
}

function hasCompatibleDayFormat(days, weekdays, allowBlankDay) {
  return !(allowBlankDay && isQuestionMark(days) && isQuestionMark(weekdays))
}

function split(cron) {
  return cron.trim().split(/\s+/)
}

function isValidCron(cron) {
  const options = {
    alias: false,
    seconds: false,
    allowBlankDay: false,
    allowSevenAsSunday: false,
    allowNthWeekdayOfMonth: false,
  }

  const splits = split(cron)

  if (splits.length > (options.seconds ? 6 : 5) || splits.length < 5) {
    return false
  }

  const checks = []
  if (splits.length === 6) {
    const seconds = splits.shift()
    if (seconds) {
      checks.push(hasValidSeconds(seconds))
    }
  }

  // We could only check the steps gradually and return false on the first invalid block,
  // However, this won't have any performance impact so why bother for now.
  const [minutes, hours, days, months, weekdays] = splits
  checks.push(hasValidMinutes(minutes))
  checks.push(hasValidHours(hours))
  checks.push(hasValidDays(days, options.allowBlankDay))
  checks.push(hasValidMonths(months, options.alias))
  checks.push(hasValidWeekdays(weekdays, options))
  checks.push(hasCompatibleDayFormat(days, weekdays, options.allowBlankDay))

  return checks.every(Boolean)
}
