import { Tracks } from 'types/spotify.ts'
import { getToken } from '~/utils/spotify.ts'

const TOP_TRACKS_ENDPOINT =
	'https://api.spotify.com/v1/me/top/tracks?time_range=long_term&limit=10'

export async function loader() {
	return getTopTracks()
}

type TopTracksResponse = {
	data?: Tracks
	status: number
}

async function getTopTracks(): Promise<TopTracksResponse> {
	const token = await getToken()

	const response = await fetch(TOP_TRACKS_ENDPOINT, {
		headers: {
			Authorization: `Bearer ${token}`,
		},
	})

	console.log('token:', token)
	console.log('Top tracks response:', response.status)

	if (response.status === 204) {
		console.log('No top tracks found.')
		return { status: response.status }
	}

	try {
		const data = (await response.json()) as Tracks
		return { data, status: response.status }
	} catch (error) {
		console.error('Error fetching top tracks:', error)
		return { status: response.status }
	}
}
