/// <reference types="vite/client" />
/// <reference types="google.maps" />

// NOTE: The Google Maps script must be loaded before these functions are called.

export const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    if (typeof google === 'undefined') {
        console.error("Google Maps API not loaded");
        return 0;
    }
    const p1 = new google.maps.LatLng(lat1, lng1);
    const p2 = new google.maps.LatLng(lat2, lng2);
    return google.maps.geometry.spherical.computeDistanceBetween(p1, p2);
};

export const getPlacePredictions = async (query: string): Promise<any[]> => {
    return getAutocompletePredictions(query);
};

// Renamed for clarity: This wraps the AutocompleteService
export const getAutocompletePredictions = async (query: string): Promise<any[]> => {
    if (typeof google === 'undefined') return [];

    return new Promise((resolve) => {
        const service = new google.maps.places.AutocompleteService();
        const request: google.maps.places.AutocompletionRequest = {
            input: query,
        };

        service.getPlacePredictions(request, (predictions, status) => {
            if (status !== google.maps.places.PlacesServiceStatus.OK || !predictions) {
                resolve([]);
                return;
            }

            const results = predictions.map(p => ({
                id: p.place_id,
                place_id: p.place_id,
                name: p.description,
                vicinity: p.structured_formatting.secondary_text,
                main_text: p.structured_formatting.main_text,
                secondary_text: p.structured_formatting.secondary_text,
                // Autocomplete doesn't return value for rating/photos/geometry usually
            }));
            resolve(results);
        });
    });
};

// New function: Uses PlacesService for "nearby search" or "text search"
// This returns rich data (rating, photos, geometry) needed for Hotels/Attractions
export const searchNearbyPlaces = async (keyword: string, location?: { lat: number, lng: number }, radius: number = 5000): Promise<any[]> => {
    if (typeof google === 'undefined') return [];

    const dummyDiv = document.createElement('div');
    const service = new google.maps.places.PlacesService(dummyDiv);

    const request: google.maps.places.TextSearchRequest = {
        query: keyword,
    };

    if (location) {
        request.location = new google.maps.LatLng(location.lat, location.lng);
        request.radius = radius; 
    }

    return new Promise((resolve) => {
        service.textSearch(request, (results, status) => {
             if (status === google.maps.places.PlacesServiceStatus.OK && results) {
                 const formattedResults = results.map(place => ({
                     id: place.place_id,
                     place_id: place.place_id,
                     name: place.name,
                     vicinity: place.formatted_address, // Text search often gives formatted_address
                     rating: place.rating,
                     user_ratings_total: place.user_ratings_total,
                     geometry: place.geometry,
                     photos: place.photos ? place.photos.map(p => p.getUrl({ maxWidth: 400 })) : [],
                     icon: place.icon
                 }));
                 resolve(formattedResults);
             } else {
                 console.warn("Places Text Search failed or found nothing:", status);
                 resolve([]);
             }
        });
    });
};

// Kept for backward compatibility if needed, but implementation maps to autocomplete
export const searchPlaces = async (query: string, location?: { lat: number, lng: number }): Promise<any[]> => {
    return getAutocompletePredictions(query);
};

export const getPlaceDetails = async (placeId: string): Promise<any> => {
    if (typeof google === 'undefined') return null;

    const dummyDiv = document.createElement('div');
    const service = new google.maps.places.PlacesService(dummyDiv);

    return new Promise((resolve, reject) => {
        service.getDetails({
            placeId: placeId,
            fields: ['name', 'geometry', 'formatted_address', 'photos', 'rating']
        }, (place, status) => {
            if (status === google.maps.places.PlacesServiceStatus.OK && place) {
                resolve(place);
            } else {
                resolve(null);
            }
        });
    });
};


export const getDirections = async (
    origin: string | { lat: number, lng: number },
    destination: string | { lat: number, lng: number },
    waypoints: { location: string | { lat: number, lng: number }, stopover: boolean }[] = []
): Promise<google.maps.DirectionsResult | null> => {
    if (typeof google === 'undefined') return null;

    const directionsService = new google.maps.DirectionsService();

    const originLoc = typeof origin === 'string' ? origin : new google.maps.LatLng(origin.lat, origin.lng);
    const destLoc = typeof destination === 'string' ? destination : new google.maps.LatLng(destination.lat, destination.lng);

    // Convert waypoints to Google Maps format
    const googleWaypoints: google.maps.DirectionsWaypoint[] = waypoints.map(wp => {
        const loc = typeof wp.location === 'string' ? wp.location : new google.maps.LatLng(wp.location.lat, wp.location.lng);
        return {
            location: loc,
            stopover: wp.stopover
        };
    });

    return new Promise((resolve) => {
        directionsService.route({
            origin: originLoc,
            destination: destLoc,
            waypoints: googleWaypoints,
            travelMode: google.maps.TravelMode.DRIVING,
        }, (result, status) => {
            if (status === google.maps.DirectionsStatus.OK && result) {
                resolve(result);
            } else {
                console.error("Directions request failed due to " + status);
                resolve(null);
            }
        });
    });
};

export const reverseGeocode = async (lat: number, lng: number): Promise<string> => {
    if (typeof google === 'undefined') return "Unknown Location";

    const geocoder = new google.maps.Geocoder();
    const latlng = { lat, lng };

    return new Promise((resolve) => {
        geocoder.geocode({ location: latlng }, (results, status) => {
            if (status === "OK" && results && results[0]) {
                resolve(results[0].formatted_address);
            } else {
                console.error("Geocoder failed due to: " + status);
                resolve("Unknown Location");
            }
        });
    });
};
