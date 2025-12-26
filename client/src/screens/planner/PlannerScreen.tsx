
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAppContext } from '../../contexts/AppContext';
import { MainTab, Stay } from '../../types';
import { MicrophoneIcon, CheckIcon, PlusIcon } from '../../constants';
import { MicrophonePermissionError, GeolocationPermissionError } from '../../components/common/PermissionErrors';
import { PredictionsList } from '../../components/map/PredictionsList';
import { TabScreenHeader } from '../../components/common/TabScreenHeader';
import { Screen } from '../../types';

import { getPlacePredictions, searchNearbyPlaces, reverseGeocode } from '../../services/mapService';
import { PlacePrediction } from '../../components/map/PredictionsList';

export const PlannerScreen = () => {
    const {
        savedRoutes, addRoute, removeRoute, setScreen, setActiveTab,
    } = useAppContext();

    // Planner state
    const [step, setStep] = useState(1);
    const [destination, setDestination] = useState('');
    const [hasStayPlanned, setHasStayPlanned] = useState(false);
    const [stayLocation, setStayLocation] = useState('');
    const [stays, setStays] = useState<Stay[]>([]);
    const [isLoadingStays, setIsLoadingStays] = useState(false);
    const [staysError, setStaysError] = useState<string | null>(null);
    const [selectedStayId, setSelectedStayId] = useState<string | null>(null);

    const [nearbyAttractions, setNearbyAttractions] = useState<Stay[]>([]);
    const [isLoadingAttractions, setIsLoadingAttractions] = useState(false);
    const [attractionsError, setAttractionsError] = useState<string | null>(null);

    const [locationError, setLocationError] = useState<string | null>(null);
    const [isFetchingLocation, setIsFetchingLocation] = useState(false);

    // Autocomplete state
    const [destinationPredictions, setDestinationPredictions] = useState<PlacePrediction[]>([]);
    const [stayPredictions, setStayPredictions] = useState<PlacePrediction[]>([]);
    const [activePlannerInput, setActivePlannerInput] = useState<'destination' | 'stay' | null>(null);

    const [micPermissionError, setMicPermissionError] = useState<string | null>(null);
    const [isListeningFor, setIsListeningFor] = useState<'destination' | 'stay' | null>(null);
    const recognitionRef = useRef<any>(null);

    // Removed initial autocomplete service check
    useEffect(() => {
        // No-op for now
    }, []);

    useEffect(() => {
        const fetchPredictions = async () => {
            if (activePlannerInput === 'destination' && destination && destination.length > 2 && destination !== 'Current Location') {
                const results = await getPlacePredictions(destination);
                setDestinationPredictions(results);
            } else {
                setDestinationPredictions([]);
            }
        };
        const timer = setTimeout(fetchPredictions, 300);
        return () => clearTimeout(timer);
    }, [destination, activePlannerInput]);

    useEffect(() => {
        const fetchPredictions = async () => {
            if (activePlannerInput === 'stay' && stayLocation && stayLocation.length > 2) {
                // We can append destination context if needed, but for now just search the location
                const results = await getPlacePredictions(stayLocation + (destination ? ` near ${destination}` : ''));
                setStayPredictions(results);
            } else {
                setStayPredictions([]);
            }
        };
        const timer = setTimeout(fetchPredictions, 300);
        return () => clearTimeout(timer);
    }, [stayLocation, activePlannerInput, destination]);


    // Helper to geocode destination string to coords
    const resolveDestinationCoords = async (dest: string) => {
        if (!dest) return null;
        try {
            // Use searchNearbyPlaces (TextSearch) to get geometry for the string
            const results = await searchNearbyPlaces(dest);
            if (results && results.length > 0 && results[0].geometry?.location) {
                return results[0].geometry.location;
            }
        } catch (e) {
            console.error("Failed to resolve coords for", dest);
        }
        return null;
    };

    // Placeholder images to avoid "same image" look
    const STAY_IMAGES = [
        'https://images.unsplash.com/photo-1582719508461-905c673771fd?q=80&w=2825&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1566073771259-6a8506099945?q=80&w=2940&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?q=80&w=2940&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1445019980597-93fa8acb246c?q=80&w=2948&auto=format&fit=crop'
    ];
    const ATTRACTION_IMAGES = [
        'https://images.unsplash.com/photo-1500835556837-99ac94a94552?q=80&w=2574&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?q=80&w=2940&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?q=80&w=2021&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1533929736472-594e45db7054?q=80&w=2940&auto=format&fit=crop'
    ];

    useEffect(() => {
        const fetchStays = async () => {
            if (step === 2 && !hasStayPlanned && destination && destination !== 'Current Location') {
                setIsLoadingStays(true);
                setStaysError(null);
                setStays([]);
                setSelectedStayId(null);

                const destCoords = await resolveDestinationCoords(destination);
                const results = await searchNearbyPlaces(`hotels and resorts`, destCoords || undefined, 5000);

                if (results && results.length > 0) {
                    const formattedStays: Stay[] = results.map(place => ({
                        id: place.id,
                        name: place.name,
                        distance: place.vicinity || place.formatted_address || '',
                        rating: place.rating || 4.0,
                        image: place.photos?.[0] || STAY_IMAGES[Math.floor(Math.random() * STAY_IMAGES.length)],
                    }));
                    setStays(formattedStays.slice(0, 15));
                } else {
                    setStaysError('Could not find any stays. Please try a different destination.');
                }
                setIsLoadingStays(false);
            }
        };

        if (step === 2 && !hasStayPlanned && destination) {
            fetchStays();
        } else if (step < 2) {
            setStays([]);
            setStaysError(null);
        }
    }, [step, hasStayPlanned, destination]);

    useEffect(() => {
        const fetchAttractions = async () => {
            if (step === 3 && destination && destination !== 'Current Location') {
                setIsLoadingAttractions(true);
                setAttractionsError(null);
                setNearbyAttractions([]);

                const destCoords = await resolveDestinationCoords(destination);
                const results = await searchNearbyPlaces(`tourist attractions`, destCoords || undefined, 5000);

                if (results && results.length > 0) {
                    const formattedAttractions: Stay[] = results.map(place => ({
                        id: place.id,
                        name: place.name,
                        distance: place.vicinity || place.formatted_address || 'Details unavailable',
                        rating: place.rating || 4.2,
                        image: place.photos?.[0] || ATTRACTION_IMAGES[Math.floor(Math.random() * ATTRACTION_IMAGES.length)],
                    }));
                    setNearbyAttractions(formattedAttractions.slice(0, 15));
                } else {
                    setAttractionsError('Could not find attractions for this destination.');
                }
                setIsLoadingAttractions(false);
            }
        };

        if (step === 3 && destination) {
            fetchAttractions();
        }
    }, [step, destination]);


    const handleDestinationNext = async () => {
        setLocationError(null);
        if (destination === 'Current Location') {
            setIsFetchingLocation(true);
            try {
                if (!navigator.geolocation) {
                    throw new Error("Geolocation is not supported by your browser.");
                }
                const position = await new Promise<GeolocationPosition>((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
                });

                // Use new reverse geocode service
                const address = await reverseGeocode(position.coords.latitude, position.coords.longitude);
                if (address && address !== "Unknown Location") {
                    setDestination(address);
                    setStep(2);
                } else {
                    throw new Error('Could not determine location name.');
                }
            } catch (error: any) {
                console.error("Error getting current location for planner:", error);
                let errorMessage = "Could not get your location. Please enter a destination manually.";
                if (error?.code === 1) errorMessage = "Location access denied. Please enable location permissions.";
                else if (error?.code === 2) errorMessage = "Location information is unavailable.";
                else if (error?.code === 3) errorMessage = "Location request timed out.";
                setLocationError(errorMessage);
            } finally {
                setIsFetchingLocation(false);
            }
        } else if (destination) {
            setStep(2);
        }
    };

    const handleDestinationFocus = () => {
        if (destination === 'Current Location') {
            setDestination('');
        }
        setActivePlannerInput('destination');
    };

    const handleStayInfoNext = () => {
        if (hasStayPlanned && !stayLocation) return;
        if (!hasStayPlanned && !selectedStayId) return;
        setStep(3);
    };

    const completeAndGoHome = () => {
        setDestination('Current Location');
        setHasStayPlanned(false);
        setStayLocation('');
        setSelectedStayId(null);
        setStep(1);
        setScreen(Screen.Home);
    };

    const stayName = useMemo(() => hasStayPlanned ? stayLocation : stays.find(s => s.id === selectedStayId)?.name, [hasStayPlanned, stayLocation, selectedStayId, stays]);

    const handleToggleDestination = (dest: Stay) => {
        if (!stayName) return;

        const existingRoute = savedRoutes.find(r => r.origin === stayName && r.destination === dest.name);

        if (existingRoute) {
            removeRoute(existingRoute.id);
        } else {
            addRoute({ origin: stayName, destination: dest.name, stay: stayName });
        }
    };

    const handleVoiceSearch = async (field: 'destination' | 'stay') => {
        if (isListeningFor) {
            recognitionRef.current?.stop();
            return;
        }

        setMicPermissionError(null);
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            setMicPermissionError("Speech recognition is not supported by your browser. Please try a different browser.");
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop());
        } catch (err: any) {
            console.error("Microphone permission error:", err);
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                setMicPermissionError("Microphone access denied. Please enable microphone permissions in your browser and device settings to use voice search.");
            } else {
                setMicPermissionError(`An error occurred while accessing the microphone: ${err.message}.`);
            }
            return;
        }

        const recognition = new SpeechRecognition();
        recognitionRef.current = recognition;
        recognition.lang = 'en-US';
        recognition.interimResults = false;

        recognition.onstart = () => {
            setIsListeningFor(field);
        };

        recognition.onend = () => {
            setIsListeningFor(null);
            recognitionRef.current = null;
        };

        recognition.onerror = (event: any) => {
            setMicPermissionError(`A speech recognition error occurred: ${event.error}. Please try again.`);
            setIsListeningFor(null);
        };

        recognition.onresult = (event: any) => {
            const transcript = event.results[0][0].transcript;
            if (field === 'destination') {
                setDestination(transcript);
            } else {
                setStayLocation(transcript);
            }
        };

        recognition.start();
    };

    if (step === 3) {
        return (
            <>
                <TabScreenHeader title="My Planner" />
                <div style={{ display: 'none' }} />
                <div className="p-4 text-gray-900 dark:text-white">
                    <h1 className="text-2xl font-bold">Suggestions for {destination}</h1>
                    <p className="text-gray-500 dark:text-gray-300 my-2">Showing places near {stayName}.</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Add these to your saved destinations.</p>

                    {isLoadingAttractions && <p className="text-center mt-8 text-gray-500 dark:text-gray-300">Finding nearby attractions...</p>}
                    {attractionsError && <p className="text-center mt-8 text-red-500">{attractionsError}</p>}
                    {!isLoadingAttractions && !attractionsError && nearbyAttractions.length === 0 && <p className="text-center mt-8 text-gray-500">No popular attractions found.</p>}

                    <ul className="space-y-2">
                        {nearbyAttractions.map(dest => {
                            const isAdded = savedRoutes.some(r => r.origin === stayName && r.destination === dest.name);
                            return (
                                <li key={dest.id} className="bg-white dark:bg-slate-700 p-3 rounded-lg flex justify-between items-center shadow-sm">
                                    <div className="flex items-center space-x-3 overflow-hidden">
                                        <img src={dest.image} alt={dest.name} className="w-12 h-12 rounded-md object-cover flex-shrink-0" />
                                        <div className="overflow-hidden">
                                            <h3 className="font-bold truncate" title={dest.name}>{dest.name}</h3>
                                            <div className="flex items-center space-x-2">
                                                {dest.rating > 0 && <p className="text-sm text-gray-500 dark:text-gray-300">{dest.rating.toFixed(1)} ★</p>}
                                            </div>
                                            <p className="text-xs text-gray-400 dark:text-gray-400 truncate" title={dest.distance}>{dest.distance}</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleToggleDestination(dest)}
                                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors flex-shrink-0 ml-2 ${isAdded ? 'bg-green-600' : 'bg-blue-600 active:bg-blue-500'}`}
                                        aria-label={isAdded ? `Remove ${dest.name}` : `Add ${dest.name}`}
                                    >
                                        {isAdded ? <CheckIcon className="h-6 w-6 text-white" /> : <PlusIcon className="h-6 w-6 text-white" />}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                    <button onClick={completeAndGoHome} className="mt-4 w-full bg-blue-600 text-white font-bold py-3 rounded-lg">Completed</button>
                    <button onClick={() => setActiveTab(MainTab.Destinations)} className="mt-2 w-full bg-gray-600 dark:bg-slate-600 text-white font-bold py-3 rounded-lg">My Places</button>
                </div>
            </>
        );
    }

    if (step === 2) {
        return (
            <>
                <TabScreenHeader title="My Planner" />
                {/* Hidden div for Google PlacesService */}
                <div style={{ display: 'none' }} />
                <div className="p-4 text-gray-900 dark:text-white">
                    <div className="flex items-center justify-between bg-white dark:bg-slate-700 p-3 rounded-lg shadow-sm">
                        <label htmlFor="stay-toggle" className="text-gray-800 dark:text-gray-300 font-medium">Have you planned your stay?</label>
                        <button onClick={() => setHasStayPlanned(!hasStayPlanned)} className={`relative w-12 h-6 rounded-full flex items-center transition-colors ${hasStayPlanned ? 'bg-blue-600' : 'bg-gray-300 dark:bg-slate-500'}`}>
                            <span className={`w-5 h-5 bg-white rounded-full transform transition-transform absolute ${hasStayPlanned ? 'translate-x-6' : 'translate-x-1'}`}></span>
                        </button>
                    </div>
                    {hasStayPlanned ? (
                        <div className="mt-4">
                            <label className="text-gray-500 dark:text-gray-300">Enter stay location</label>
                            <div className="relative mt-2">
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={stayLocation}
                                        onChange={e => setStayLocation(e.target.value)}
                                        onFocus={() => setActivePlannerInput('stay')}
                                        onBlur={() => setTimeout(() => setActivePlannerInput(null), 150)}
                                        placeholder="e.g., Fariyas Resort"
                                        className="w-full bg-gray-100 dark:bg-slate-700 rounded-lg p-3 pr-10 placeholder-gray-400 dark:placeholder-gray-500"
                                        autoComplete="off"
                                    />
                                    <button
                                        onClick={() => handleVoiceSearch('stay')}
                                        className={`absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full transition-colors ${isListeningFor === 'stay' ? 'bg-red-500/20 text-red-500 animate-pulse' : 'text-gray-500 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'}`}
                                        aria-label="Search by voice for stay location"
                                    >
                                        <MicrophoneIcon className="w-5 h-5" />
                                    </button>
                                </div>
                                {activePlannerInput === 'stay' && stayPredictions.length > 0 && (
                                    <PredictionsList
                                        predictions={stayPredictions}
                                        onSelect={(p) => {
                                            setStayLocation(p.description);
                                            setActivePlannerInput(null);
                                        }}
                                    />
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="mt-4">
                            <p className="text-gray-500 dark:text-gray-300 my-2">Please select a stay to see nearby places.</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Showing popular resorts near {destination}.</p>
                            {isLoadingStays && <p className="text-center mt-8 text-gray-500 dark:text-gray-300">Finding nearby stays...</p>}
                            {staysError && <p className="text-center mt-8 text-red-500">{staysError}</p>}
                            {!isLoadingStays && !staysError && stays.length === 0 && <p className="text-center mt-8 text-gray-500">No stays found for this destination.</p>}
                            <ul className="space-y-2">
                                {stays.map(stay => (
                                    <li key={stay.id} className="bg-white dark:bg-slate-700 p-3 rounded-lg flex justify-between items-center shadow-sm">
                                        <div className="flex items-center space-x-3">
                                            <img src={stay.image} alt={stay.name} className="w-12 h-12 rounded-md object-cover" />
                                            <div>
                                                <h3 className="font-bold">{stay.name}</h3>
                                                <p className="text-sm text-gray-500 dark:text-gray-300">{stay.rating} ★</p>
                                                <p className="text-xs text-gray-400 dark:text-gray-400 truncate w-48">{stay.distance}</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => setSelectedStayId(stay.id)}
                                            className={`px-4 py-1.5 rounded-md text-sm font-semibold ${selectedStayId === stay.id ? 'bg-green-600 text-white' : 'bg-blue-600 text-white'}`}
                                        >
                                            {selectedStayId === stay.id ? 'Selected' : 'Select'}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    <button onClick={handleStayInfoNext} disabled={(hasStayPlanned && !stayLocation) || (!hasStayPlanned && !selectedStayId)} className="mt-4 w-full bg-blue-600 text-white font-bold py-3 rounded-lg disabled:bg-gray-300 dark:disabled:bg-gray-600">Find Places</button>
                    {micPermissionError && (
                        <MicrophonePermissionError
                            message={micPermissionError}
                            onRetry={() => setMicPermissionError(null)}
                            onCancel={() => setMicPermissionError(null)}
                        />
                    )}
                </div>
            </>
        )
    }

    return (
        <>
            <TabScreenHeader title="My Planner" />
            <div className="p-4 text-gray-900 dark:text-white relative">
                <div className="mt-4">
                    <label className="text-gray-500 dark:text-gray-300">My Destination?</label>
                    <div className="relative mt-2">
                        <div className="relative">
                            <input
                                type="text"
                                value={destination}
                                onChange={e => setDestination(e.target.value)}
                                onFocus={handleDestinationFocus}
                                onBlur={() => {
                                    if (destination.trim() === '') setDestination('Current Location');
                                    setTimeout(() => setActivePlannerInput(null), 150);
                                }}
                                placeholder="e.g., Lonavala"
                                className="w-full bg-gray-100 dark:bg-slate-700 rounded-lg p-3 pr-10 placeholder-gray-400 dark:placeholder-gray-500"
                                autoComplete="off"
                            />
                            <button
                                onClick={() => handleVoiceSearch('destination')}
                                className={`absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full transition-colors ${isListeningFor === 'destination' ? 'bg-red-500/20 text-red-500 animate-pulse' : 'text-gray-500 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'}`}
                                aria-label="Search by voice for destination"
                            >
                                <MicrophoneIcon className="w-5 h-5" />
                            </button>
                        </div>
                        {activePlannerInput === 'destination' && destinationPredictions.length > 0 && (
                            <PredictionsList
                                predictions={destinationPredictions}
                                onSelect={(p) => {
                                    setDestination(p.description);
                                    setActivePlannerInput(null);
                                }}
                            />
                        )}
                    </div>

                    <button
                        onClick={handleDestinationNext}
                        disabled={!destination || isFetchingLocation}
                        className="mt-4 w-full bg-blue-600 text-white font-bold py-3 rounded-lg disabled:bg-gray-300 dark:disabled:bg-gray-600"
                    >
                        {isFetchingLocation ? 'Getting Location...' : 'Next'}
                    </button>
                </div>
                {locationError && (
                    <GeolocationPermissionError
                        message={locationError}
                        onRetry={() => {
                            handleDestinationNext();
                        }}
                        onCancel={() => {
                            setLocationError(null);
                            if (destination === 'Current Location') {
                                setDestination('');
                            }
                        }}
                    />
                )}
                {micPermissionError && (
                    <MicrophonePermissionError
                        message={micPermissionError}
                        onRetry={() => setMicPermissionError(null)}
                        onCancel={() => setMicPermissionError(null)}
                    />
                )}
            </div>
        </>
    );
};
