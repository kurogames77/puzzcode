const TEMP_BATTLE_ACCESS_KEY = 'puzzcode_temp_battle_access'

export const getTempBattleAccess = (): boolean => {
  if (typeof window === 'undefined') {
    return false
  }
  return localStorage.getItem(TEMP_BATTLE_ACCESS_KEY) === 'true'
}

export const setTempBattleAccess = (enabled: boolean) => {
  if (typeof window === 'undefined') {
    return
  }

  if (enabled) {
    localStorage.setItem(TEMP_BATTLE_ACCESS_KEY, 'true')
  } else {
    localStorage.removeItem(TEMP_BATTLE_ACCESS_KEY)
  }
}

export const TEMP_BATTLE_ACCESS_QUERY = 'tempAccess'

export { TEMP_BATTLE_ACCESS_KEY }

