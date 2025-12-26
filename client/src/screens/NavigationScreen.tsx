
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleMap, useJsApiLoader, DirectionsRenderer, Marker } from '@react-google-maps/api';
import { useAppContext } from '../contexts/AppContext';
import { TripDetails } from '../types';
import { RecenterIcon } from '../constants';
import { InstructionPanel } from '../components/map/InstructionPanel';
import { GeolocationPermissionError } from '../components/common/PermissionErrors';
import { AddStopModal } from '../components/map/AddStopModal';
import { StopsListModal } from '../components/map/StopsListModal';
import { getDirections, calculateDistance, searchPlaces, searchNearbyPlaces, reverseGeocode, getPlaceDetails } from '../services/mapService';

const libraries: ("places" | "geometry")[] = ["places", "geometry"];

export const NavigationScreen = ({ tripDetails, onCheckOut }: { tripDetails: TripDetails, onCheckOut: () => void }) => {
    const { theme } = useAppContext();
    const { isLoaded, loadError } = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
        libraries: libraries
    });

    const [showAddStopModal, setShowAddStopModal] = useState(false);
    const mapRef = useRef<google.maps.Map | null>(null);
    const [userLocation, setUserLocation] = useState<{ lat: number, lng: number } | null>(null);
    const locationWatcherId = useRef<number | null>(null);

    const [mapError, setMapError] = useState<{ type: 'permission' | 'network' | 'generic'; message: string } | null>(null);
    const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);

    // Navigation State
    const [currentLegIndex, setCurrentLegIndex] = useState(0);
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [distanceToNextTurn, setDistanceToNextTurn] = useState('');
    const [tripMetrics, setTripMetrics] = useState({ eta: '--:--', remainingDist: '--.- km', duration: '-- min' });
    const [isAutoCentering, setIsAutoCentering] = useState(true);
    const [currentTrip, setCurrentTrip] = useState(tripDetails);

    // Stops
    const [waypoints, setWaypoints] = useState<any[]>([]);
    const [stopSearchResults, setStopSearchResults] = useState<any[] | null>(null);
    const [isStopsListVisible, setIsStopsListVisible] = useState(false);
    const [isCalculatingStops, setIsCalculatingStops] = useState(false);

    const onLoad = useCallback(function callback(map: google.maps.Map) {
        mapRef.current = map;
    }, []);

    const onUnmount = useCallback(function callback(map: google.maps.Map) {
        mapRef.current = null;
    }, []);

    const getRouteLocation = useCallback((locationString: string | undefined): { lat: number, lng: number } | string | undefined => {
        if (!locationString) return undefined;
        if (locationString === 'Current Location') return locationString;

        const coordinateRegex = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;
        const match = locationString.match(coordinateRegex);
        if (match) {
            const lat = parseFloat(match[1]);
            const lng = parseFloat(match[2]);
            if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
        }
        return locationString;
    }, []);

    const recenterMap = useCallback(() => {
        if (mapRef.current && userLocation) {
            mapRef.current.panTo(userLocation);
            mapRef.current.setZoom(17);
            setIsAutoCentering(true);
        }
    }, [userLocation]);

    // Handle adding stops logic (simplified for Google Maps)
    const handleAddStopCategory = useCallback(async (type: string, keyword: string) => {
        setShowAddStopModal(false);
        if (!userLocation) {
            setMapError({ type: 'generic', message: "Could not get current location." });
            return;
        }

        setIsCalculatingStops(true);
        setIsStopsListVisible(true);
        setStopSearchResults(null);

        // Uses the new PlacesService wrapper for better category search results
        const results = await searchNearbyPlaces(keyword, userLocation);

        if (results && results.length > 0) {
            const placesWithDistance = results.map(place => {
                // We now have geometry in the result
                const dist = calculateDistance(
                    userLocation.lat, userLocation.lng,
                    place.geometry.location.lat(), place.geometry.location.lng()
                );

                return {
                    place: {
                        ...place,
                        description: place.name, // Adapter for StopsModal
                        secondary_text: place.vicinity
                    },
                    distance: { value: dist, text: dist < 1000 ? `${Math.round(dist)} m` : `${(dist / 1000).toFixed(1)} km` },
                    duration: { value: 0, text: 'Unknown' }
                };
            });
            // Sort by distance
            placesWithDistance.sort((a, b) => a.distance.value - b.distance.value);
            setStopSearchResults(placesWithDistance);
        } else {
            setMapError({ type: 'generic', message: `No ${keyword} found nearby.` });
            setTimeout(() => { setIsStopsListVisible(false); setMapError(null); }, 2500);
        }
        setIsCalculatingStops(false);
    }, [userLocation]);

    const handleSelectStop = async (placeResult: any) => {
        // We need the location of the stop to add it as a waypoint
        // prefer geometry location if available, else description string
        const loc = placeResult.place.geometry ? placeResult.place.geometry.location : placeResult.place.description;

        setWaypoints(prev => [...prev, { location: loc, stopover: true }]);
        setIsStopsListVisible(false);
        setStopSearchResults(null);
    };

    const handlePlaceSelect = async (placeId: string) => {
        setShowAddStopModal(false);
        // Direct selection from add modal search bar
        const place = await getPlaceDetails(placeId);
        if (place && place.geometry && place.geometry.location) {
            setWaypoints(prev => [...prev, { location: place.geometry.location, stopover: true }]);
        } else {
            setMapError({ type: 'generic', message: "Could not get details for selected stop." });
        }
    };

    const handleRemoveStop = () => setWaypoints([]);

    // Calculate Route
    useEffect(() => {
        if (!isLoaded || !currentTrip.from || !currentTrip.to) return;

        const fetchRoute = async () => {
            // Helper to resolve location
            const resolveLoc = async (loc: string) => {
                const coord = getRouteLocation(loc);
                if (coord && typeof coord !== 'string') return coord;
                // If it's a string, we pass it directly to Google Directions service, it handles geocoding!
                return loc;
            };

            const origin = await resolveLoc(currentTrip.from);
            const dest = await resolveLoc(currentTrip.to);

            if (!origin || !dest) return;

            // Prepare waypoints
            const googleWaypoints = waypoints.map(wp => ({
                location: wp.location,
                stopover: wp.stopover
            }));

            const result = await getDirections(origin, dest, googleWaypoints);
            if (result) {
                setDirections(result);
                setMapError(null);

                const route = result.routes[0];
                const leg = route.legs[0];
                setTripMetrics({
                    eta: leg.duration?.text || '--', // Google gives formatted text
                    remainingDist: leg.distance?.text || '--',
                    duration: leg.duration?.text || '--'
                });
            } else {
                setMapError({ type: 'generic', message: "Could not fetch directions." });
            }
        };

        fetchRoute();
    }, [isLoaded, currentTrip.from, currentTrip.to, waypoints]);

    // Track User Location
    useEffect(() => {
        if (!navigator.geolocation) {
            setMapError({ type: 'permission', message: "Geolocation is not supported." });
            return;
        }

        locationWatcherId.current = navigator.geolocation.watchPosition(
            async (position) => {
                const newPos = { lat: position.coords.latitude, lng: position.coords.longitude };
                setUserLocation(newPos);

                if (isAutoCentering && mapRef.current) {
                    mapRef.current.panTo(newPos);
                }

                if (currentTrip.from === 'Current Location') {
                    // Update header address occasionally
                    try {
                        const addr = await reverseGeocode(newPos.lat, newPos.lng);
                        if (addr) setCurrentTrip(prev => ({ ...prev, from: addr }));
                    } catch (e) {
                        // ignore
                    }
                }

                // Simulate Turn-by-Turn Progress
                if (directions && directions.routes[0] && directions.routes[0].legs[0]) {
                    const steps = directions.routes[0].legs[0].steps;
                    const step = steps[currentStepIndex];
                    if (step) {
                        const dist = calculateDistance(newPos.lat, newPos.lng, step.end_location.lat(), step.end_location.lng());
                        setDistanceToNextTurn(dist < 1000 ? `${Math.round(dist)} m` : `${(dist / 1000).toFixed(1)} km`);

                        // Advance step if close
                        if (dist < 40 && currentStepIndex < steps.length - 1) {
                            setCurrentStepIndex(prev => prev + 1);
                        }
                    }
                }
            },
            (err) => {
                console.error(err);
                if (err.code === 1) setMapError({ type: 'permission', message: "Location permission denied." });
            },
            { enableHighAccuracy: true, maximumAge: 0 }
        );

        return () => {
            if (locationWatcherId.current !== null) navigator.geolocation.clearWatch(locationWatcherId.current);
        };
    }, [isAutoCentering, directions, currentStepIndex]);


    if (loadError) {
        return <div className="flex items-center justify-center h-full text-red-500">Error loading maps</div>;
    }

    if (!isLoaded) {
        return <div className="flex items-center justify-center h-full text-gray-500">Loading Maps...</div>;
    }

    return (
        <div className="text-gray-900 dark:text-white h-full flex flex-col relative">
            {showAddStopModal && <AddStopModal onClose={() => setShowAddStopModal(false)} onCategorySelect={handleAddStopCategory} onPlaceSelect={handlePlaceSelect} />}
            {isStopsListVisible && (
                <StopsListModal
                    title="Nearby Stops"
                    stops={stopSearchResults}
                    onSelect={handleSelectStop}
                    onClose={() => setIsStopsListVisible(false)}
                    isLoading={isCalculatingStops}
                />
            )}

            <InstructionPanel
                step={directions?.routes[0]?.legs[0]?.steps[currentStepIndex]}
                distanceToNextTurn={distanceToNextTurn}
            />

            <div className="flex-grow bg-gray-200 dark:bg-slate-800 flex items-center justify-center relative overflow-hidden">
                <GoogleMap
                    mapContainerClassName="w-full h-full"
                    center={userLocation || { lat: 19.0760, lng: 72.8777 }}
                    zoom={15}
                    onLoad={onLoad}
                    onUnmount={onUnmount}
                    options={{
                        disableDefaultUI: true,
                        zoomControl: false,
                        mapTypeControl: false,
                        streetViewControl: false,
                        fullscreenControl: false,
                        styles: theme === 'dark' ? [
                            { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
                            { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
                            { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
                            {
                                featureType: "administrative.locality",
                                elementType: "labels.text.fill",
                                stylers: [{ color: "#d59563" }],
                            },
                            {
                                featureType: "poi",
                                elementType: "labels.text.fill",
                                stylers: [{ color: "#d59563" }],
                            },
                            {
                                featureType: "poi.park",
                                elementType: "geometry",
                                stylers: [{ color: "#263c3f" }],
                            },
                            {
                                featureType: "poi.park",
                                elementType: "labels.text.fill",
                                stylers: [{ color: "#6b9a76" }],
                            },
                            {
                                featureType: "road",
                                elementType: "geometry",
                                stylers: [{ color: "#38414e" }],
                            },
                            {
                                featureType: "road",
                                elementType: "geometry.stroke",
                                stylers: [{ color: "#212a37" }],
                            },
                            {
                                featureType: "road",
                                elementType: "labels.text.fill",
                                stylers: [{ color: "#9ca5b3" }],
                            },
                            {
                                featureType: "road.highway",
                                elementType: "geometry",
                                stylers: [{ color: "#746855" }],
                            },
                            {
                                featureType: "road.highway",
                                elementType: "geometry.stroke",
                                stylers: [{ color: "#1f2835" }],
                            },
                            {
                                featureType: "road.highway",
                                elementType: "labels.text.fill",
                                stylers: [{ color: "#f3d19c" }],
                            },
                            {
                                featureType: "water",
                                elementType: "geometry",
                                stylers: [{ color: "#17263c" }],
                            },
                            {
                                featureType: "water",
                                elementType: "labels.text.fill",
                                stylers: [{ color: "#515c6d" }],
                            },
                            {
                                featureType: "water",
                                elementType: "labels.text.stroke",
                                stylers: [{ color: "#17263c" }],
                            },
                        ] : []
                    }}
                    onDragStart={() => setIsAutoCentering(false)}
                >
                    {directions && (
                        <DirectionsRenderer
                            directions={directions}
                            options={{
                                polylineOptions: {
                                    strokeColor: "#06b6d4",
                                    strokeWeight: 6
                                },
                                suppressMarkers: false // Let Google show A/B markers
                            }}
                        />
                    )}

                    {userLocation && (
                        <Marker
                            position={userLocation}
                            icon={{
                                path: google.maps.SymbolPath.CIRCLE,
                                scale: 10,
                                fillColor: "#3B82F6",
                                fillOpacity: 1,
                                strokeColor: "white",
                                strokeWeight: 2,
                            }}
                            zIndex={999}
                        />
                    )}
                </GoogleMap>

                {mapError && mapError.type !== 'permission' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-800/80 p-4 z-50">
                        <div className="text-center">
                            <p className="text-red-400 text-lg font-semibold">Map Error</p>
                            <p className="text-white mt-1">{mapError.message}</p>
                            <button onClick={() => setMapError(null)} className="mt-4 px-4 py-2 bg-gray-600 rounded text-white text-sm">Dismiss</button>
                        </div>
                    </div>
                )}
                {!isAutoCentering && (
                    <button onClick={recenterMap} className="absolute bottom-5 right-4 z-10 p-3 bg-white dark:bg-slate-700 rounded-full shadow-lg" aria-label="Recenter map">
                        <RecenterIcon className="w-6 h-6 text-gray-900 dark:text-white" />
                    </button>
                )}
            </div>

            <div className="bg-white dark:bg-slate-700 p-5 z-10 shadow-[0_-10px_25px_-5px_rgba(0,0,0,0.05)] dark:shadow-none border-t border-gray-200 dark:border-slate-800">
                <div className="flex justify-around text-center">
                    <div>
                        <p className="text-2xl font-bold text-cyan-600 dark:text-cyan-400">{tripMetrics.eta}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-300">Duration</p>
                    </div>
                    <div>
                        <p className="text-2xl font-bold">{tripMetrics.remainingDist}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-300">Remaining</p>
                    </div>
                    <div>
                        {/* ETA is often absolute time in simple apps, but Google API gives "Duration" as "15 mins". 
                             So we can show Duration and Distance. 
                             Or calculate Arrival Time yourself. For now showing Duration as "ETA" label for simplicity or switch.
                         */}
                        <p className="text-2xl font-bold">{tripMetrics.duration}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-300">Time</p>
                    </div>
                </div>
            </div>

            <div className="p-4 bg-white/80 dark:bg-slate-700/50 flex gap-4 z-10 border-t border-gray-200 dark:border-slate-800">
                {waypoints.length > 0 ? (
                    <button
                        onClick={handleRemoveStop}
                        className="flex-1 bg-yellow-500 dark:bg-yellow-600 text-white font-bold py-4 rounded-lg active:bg-yellow-600 dark:active:bg-yellow-500">
                        Remove Stop
                    </button>
                ) : (
                    <button
                        onClick={() => setShowAddStopModal(true)}
                        className="flex-1 bg-gray-500 dark:bg-gray-600 text-white font-bold py-4 rounded-lg active:bg-gray-600 dark:active:bg-gray-500">
                        Add Stop
                    </button>
                )}
                <button onClick={onCheckOut} className="flex-1 bg-red-600 text-white font-bold py-4 rounded-lg active:bg-red-500">
                    END TRIP
                </button>
            </div>
        </div>
    );
};
