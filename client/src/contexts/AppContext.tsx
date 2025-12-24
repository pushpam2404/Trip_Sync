
import React, { useState, useContext, createContext, useCallback, useMemo, useEffect } from 'react';
import { AppContextType, Screen, MainTab, UserProfile, SavedRoute, Trip, ProfileSetupData, Vehicle, ModalType, PlanningTrip, TripDetails } from '../types';
import { usePersistentState } from '../hooks/usePersistentState';
import api from '../services/api';

// 1. Create Context
const AppContext = createContext<AppContextType | null>(null);

// 2. Custom Hook
export const useAppContext = () => {
    const context = useContext(AppContext);
    if (!context) {
        throw new Error('useAppContext must be used within an AppProvider');
    }
    return context;
};


// 3. AppProvider Component
export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [screen, setScreen] = usePersistentState<Screen>('tripsync-screen', Screen.Splash);
    const [user, setUser] = usePersistentState<UserProfile | null>('tripsync-user', null);
    // Removed local 'users' array as we now use backend
    const [pendingSignup, setPendingSignup] = useState<{ phone: string, password: string } | null>(null);
    const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>([]);
    const [trips, setTrips] = useState<Trip[]>([]);
    const [navigationDestination, setNavigationDestination] = useState<string | null>(null);
    const [navigationOrigin, setNavigationOrigin] = useState<string | null>('Current Location');
    const [profileSetupData, setProfileSetupData] = useState<ProfileSetupData | null>(null);
    const [activeTab, setActiveTab] = usePersistentState<MainTab>('tripsync-activeTab', MainTab.Home);
    const [activeModal, setActiveModal] = useState<ModalType>(null);
    const [planningTrip, setPlanningTrip] = useState<PlanningTrip | null>(null);
    const [isNavigating, setIsNavigating] = useState(false);
    const [currentTripDetails, setCurrentTripDetails] = useState<TripDetails | null>(null);
    const [theme, setTheme] = usePersistentState<'light' | 'dark'>('tripsync-theme', 'dark');

    useEffect(() => {
        document.documentElement.classList.toggle('dark', theme === 'dark');
    }, [theme]);

    // Fetch data when user logs in
    useEffect(() => {
        if (user) {
            fetchTrips();
            fetchSavedRoutes();
        } else {
            setTrips([]);
            setSavedRoutes([]);
        }
    }, [user]);

    const fetchTrips = async () => {
        try {
            const response = await api.get('/trips');
            setTrips(response.data);
        } catch (error) {
            console.error("Error fetching trips:", error);
        }
    };

    const fetchSavedRoutes = async () => {
        try {
            const response = await api.get('/saved-routes');
            setSavedRoutes(response.data);
        } catch (error) {
            console.error("Error fetching saved routes:", error);
        }
    };

    // This effect handles the transition from the splash screen on app startup.
    useEffect(() => {
        if (screen === Screen.Splash) {
            const timer = setTimeout(() => {
                if (user) {
                    setScreen(Screen.Home);
                } else {
                    setScreen(Screen.Login);
                }
            }, 2500);
            return () => clearTimeout(timer);
        }
    }, [screen, user, setScreen]);

    const handleLogin = useCallback(async (phone: string, password: string): Promise<{ success: boolean; message?: string }> => {
        try {
            const response = await api.post('/auth/login', { phone, password });
            setUser(response.data);
            setScreen(Screen.Home);
            return { success: true };
        } catch (error: any) {
            console.error(error);
            return { success: false, message: error.response?.data?.message || 'Login failed' };
        }
    }, [setScreen, setUser]);

    const handleSignup = useCallback(async (phone: string, password: string): Promise<{ success: boolean; message?: string }> => {
        // Validation could go here, or we can check with backend if user exists (optional)
        // For now, we proceed to profile setup
        setPendingSignup({ phone, password });
        setScreen(Screen.ProfileSetup1);
        return { success: true };
    }, [setScreen]);

    const addRoute = useCallback(async (routeData: Omit<SavedRoute, 'id' | 'travelTime'>) => {
        try {
            const response = await api.post('/saved-routes', routeData);
            setSavedRoutes(prev => [response.data, ...prev]);
        } catch (error) {
            console.error("Error saving route:", error);
            alert("Failed to save route");
        }
    }, [setSavedRoutes]);

    const removeRoute = useCallback(async (id: string) => {
        try {
            await api.delete(`/saved-routes/${id}`);
            setSavedRoutes(prev => prev.filter(r => r.id !== id));
        } catch (error) {
            console.error("Error removing route:", error);
            alert("Failed to remove route");
        }
    }, [setSavedRoutes]);

    const reverseRoute = useCallback((id: string) => {
        // This is a local UI operation, but if it implies saving a new reversed route, it should be a new add. 
        // For now, let's keep it local or just alert not supported if needed, 
        // but since it modifies state, it might not persist unless we update it.
        // Actually, "reverse" usually just temporarily swaps for a new navigation, 
        // but here it updates the saved list. Implementing an update endpoint for this is rare for "Saved Places".
        // I'll leave it local for now, but note it won't persist until "saved" again or updated.
        // Or better, let's treat it as a local view change.
        setSavedRoutes(prev => prev.map(r => {
            if (r.id === id) {
                return { ...r, origin: r.destination, destination: r.origin };
            }
            return r;
        }));
    }, [setSavedRoutes]);

    const addTrip = useCallback(async (tripData: Omit<Trip, 'id' | 'tripName' | 'date' | 'duration' | 'startTime' | 'endTime'>) => {
        try {
            // Prepare payload matching backend Trip model
            const payload = {
                origin: tripData.from,
                destination: tripData.to,
                startDate: new Date(), // Using current date for now as frontend simplifies it
                startTime: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
                vehicle: tripData.vehicleNumber,
                tripType: 'one-way', // Default
                stops: [], // Basic implementation
                // Map other fields if necessary
            };

            const response = await api.post('/trips', payload);

            // Transform backend response to frontend Trip type
            const newTrip: Trip = {
                id: response.data._id,
                tripName: `Trip to ${response.data.destination}`,
                from: response.data.origin,
                fromSubtitle: '',
                to: response.data.destination,
                toSubtitle: '',
                date: new Date(response.data.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                duration: 'N/A', // Calculated on backend or map
                startTime: response.data.startTime,
                endTime: 'N/A',
                distance: 0, // Needs calculation
                vehicleNumber: response.data.vehicle,
                travelers: 1,
                stops: response.data.stops?.length || 0,
                mode: '4W'
            };

            setTrips(prev => [newTrip, ...prev]);
        } catch (error) {
            console.error("Error adding trip:", error);
            alert("Failed to add trip");
        }
    }, [setTrips]);

    const removeTrip = useCallback(async (id: string) => {
        try {
            await api.delete(`/trips/${id}`);
            setTrips(prev => prev.filter(t => t.id !== id));
        } catch (error) {
            console.error("Error deleting trip:", error);
            alert("Failed to delete trip");
        }
    }, [setTrips]);

    const clearTrips = useCallback(() => {
        setTrips([]);
    }, [setTrips]);


    const startNavigation = useCallback((details: TripDetails) => {
        setCurrentTripDetails(details);
        setIsNavigating(true);
        setNavigationDestination(null); // Clear deeplink destination
    }, []);

    const endNavigation = useCallback(() => {
        if (currentTripDetails) {
            addTrip({
                from: currentTripDetails.from,
                fromSubtitle: 'Mock City Start',
                to: currentTripDetails.to,
                toSubtitle: 'Mock City End',
                distance: Math.floor(Math.random() * 150) + 5,
                vehicleNumber: currentTripDetails.vehicleNumber,
                travelers: currentTripDetails.travelers,
                stops: Math.floor(Math.random() * 3),
                mode: currentTripDetails.mode,
            });
        }
        setIsNavigating(false);
        setCurrentTripDetails(null);
        setNavigationOrigin('Current Location');
    }, [currentTripDetails, addTrip]);


    const startProfileSetup = useCallback((data: ProfileSetupData) => {
        setProfileSetupData(data);
        setScreen(Screen.ProfileSetup2);
    }, [setScreen]);

    const completeProfileSetup = useCallback(async (vehicles: { twoWheelers: string[], fourWheelers: string[] }) => {
        if (profileSetupData && pendingSignup) {
            try {
                const signupData = {
                    name: profileSetupData.name,
                    phone: pendingSignup.phone,
                    password: pendingSignup.password,
                    twoWheelers: vehicles.twoWheelers.map((reg, i) => ({ id: `tw${i}`, regNumber: reg })),
                    fourWheelers: vehicles.fourWheelers.map((reg, i) => ({ id: `fw${i}`, regNumber: reg })),
                };

                const response = await api.post('/auth/signup', signupData);

                setUser(response.data);
                setProfileSetupData(null);
                setPendingSignup(null);
                setScreen(Screen.Home);
            } catch (error: any) {
                console.error("Signup failed:", error);
                const errorMessage = error.response?.data?.message || error.message || "Signup failed (Unknown error)";
                alert(`Signup failed: ${errorMessage}`);
            }
        }
    }, [profileSetupData, pendingSignup, setUser, setScreen]);

    const skipProfileSetup = useCallback(async () => {
        if (profileSetupData && pendingSignup) {
            try {
                const signupData = {
                    name: profileSetupData.name,
                    phone: pendingSignup.phone,
                    password: pendingSignup.password,
                    twoWheelers: Array.from({ length: profileSetupData.numTwoWheelers }, (_, i) => ({ id: `tw_skip_${i}`, regNumber: '' })),
                    fourWheelers: Array.from({ length: profileSetupData.numFourWheelers }, (_, i) => ({ id: `fw_skip_${i}`, regNumber: '' })),
                };

                const response = await api.post('/auth/signup', signupData);

                setUser(response.data);
                setProfileSetupData(null);
                setPendingSignup(null);
                setScreen(Screen.Home);
            } catch (error: any) {
                console.error("Signup (skip) failed:", error);
                alert(error.response?.data?.message || "Signup failed");
            }
        }
    }, [profileSetupData, pendingSignup, setUser, setScreen]);


    const addVehicle = useCallback((type: 'twoWheelers' | 'fourWheelers', regNumber: string) => {
        setUser(currentUser => {
            if (!currentUser || !regNumber) return currentUser;
            const newVehicle: Vehicle = { id: String(Date.now()), regNumber };
            return {
                ...currentUser,
                [type]: [...currentUser[type], newVehicle],
            };
        });
    }, [setUser]);

    const removeVehicle = useCallback((type: 'twoWheelers' | 'fourWheelers', id: string) => {
        setUser(currentUser => {
            if (!currentUser) return null;
            return {
                ...currentUser,
                [type]: currentUser[type].filter(v => v.id !== id),
            };
        });
    }, [setUser]);

    const updateVehicle = useCallback(({ type, vehicle }: { type: 'twoWheelers' | 'fourWheelers', vehicle: Vehicle }) => {
        setUser(currentUser => {
            if (!currentUser) return null;
            const { id, regNumber } = vehicle;
            const updatedVehicles = currentUser[type].map(v =>
                v.id === id ? { ...v, regNumber } : v
            );
            return {
                ...currentUser,
                [type]: updatedVehicles,
            };
        });
    }, [setUser]);

    const startNavigationFrom = useCallback((origin: string, destination: string) => {
        setNavigationOrigin(origin);
        setNavigationDestination(destination);
        setActiveTab(MainTab.Sakha);
        setScreen(Screen.Main);
        setActiveModal('travelMode');
    }, [setScreen, setActiveTab]);

    const value = useMemo(() => ({
        screen, setScreen,
        user, setUser,
        savedRoutes, addRoute, removeRoute, reverseRoute,
        trips, addTrip, removeTrip, clearTrips,
        navigationDestination, setNavigationDestination,
        navigationOrigin, setNavigationOrigin,
        profileSetupData, startProfileSetup, completeProfileSetup, skipProfileSetup,
        addVehicle, removeVehicle, updateVehicle,
        activeTab, setActiveTab,
        activeModal, setActiveModal,
        startNavigationFrom,
        planningTrip, setPlanningTrip,
        isNavigating, currentTripDetails, startNavigation, endNavigation,
        theme, setTheme,
        handleLogin, handleSignup,
    }), [
        screen, user, savedRoutes, trips, navigationDestination, navigationOrigin,
        profileSetupData, addRoute, removeRoute, reverseRoute, addTrip, removeTrip, clearTrips,
        startProfileSetup, completeProfileSetup, skipProfileSetup, addVehicle, removeVehicle, updateVehicle,
        activeTab, activeModal, startNavigationFrom, planningTrip,
        isNavigating, currentTripDetails, startNavigation, endNavigation, theme, handleLogin, handleSignup,
        setScreen, setUser, setActiveTab, setTheme
    ]);

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
