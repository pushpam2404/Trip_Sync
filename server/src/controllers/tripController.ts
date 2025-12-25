import { Request, Response } from 'express';
import Trip from '../models/Trip';

interface AuthRequest extends Request {
    user?: any;
}

// @desc    Create a new trip
// @route   POST /api/trips
// @access  Private
export const createTrip = async (req: AuthRequest, res: Response) => {
    try {
        const {
            origin,
            destination,
            startDate,
            startTime,
            vehicle,
            customVehicle,
            tripType,
            stops,
            travelers,
        } = req.body;

        const trip = await Trip.create({
            userId: req.user._id,
            origin,
            destination,
            startDate,
            startTime,
            vehicle,
            customVehicle,
            tripType,
            stops,
            travelers,
        });

        res.status(201).json(trip);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get user trips
// @route   GET /api/trips
// @access  Private
export const getTrips = async (req: AuthRequest, res: Response) => {
    try {
        const trips = await Trip.find({ userId: req.user._id }).sort({ createdAt: -1 });
        res.json(trips);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Update a trip
// @route   PUT /api/trips/:id
// @access  Private
export const updateTrip = async (req: AuthRequest, res: Response) => {
    try {
        const trip = await Trip.findById(req.params.id);

        if (!trip) {
            return res.status(404).json({ message: 'Trip not found' });
        }

        if (trip.userId.toString() !== req.user._id.toString()) {
            return res.status(401).json({ message: 'Not authorized' });
        }

        const updatedTrip = await Trip.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
        });

        res.json(updatedTrip);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Delete a trip
// @route   DELETE /api/trips/:id
// @access  Private
export const deleteTrip = async (req: AuthRequest, res: Response) => {
    try {
        const trip = await Trip.findById(req.params.id);

        if (!trip) {
            return res.status(404).json({ message: 'Trip not found' });
        }

        if (trip.userId.toString() !== req.user._id.toString()) {
            return res.status(401).json({ message: 'Not authorized' });
        }

        await trip.deleteOne();
        res.json({ message: 'Trip removed' });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};
