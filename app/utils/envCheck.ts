// envCheck.ts
export function checkRequiredEnvironmentVariables() {
	const requiredEnvVars = [
		'CALENDAR_REFRESH_TOKEN',
		'CALENDAR_CLIENT_ID',
		'CALENDAR_CLIENT_SECRET',
		'CALENDAR_IDS',
	]

	const missingVars: string[] = []

	requiredEnvVars.forEach(varName => {
		if (typeof process.env[varName] === 'undefined') {
			missingVars.push(varName)
		}
	})

	if (missingVars.length) {
		throw new Error(
			`Missing required environment variables: ${missingVars.join(', ')}`,
		)
	}
}
