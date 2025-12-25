import mongoose from 'mongoose';

const tripSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'User',
    },
    origin: { type: String, required: true },
    destination: { type: String, required: true },
    startDate: { type: Date, required: true },
    startTime: { type: String, required: true },
    vehicle: { type: String },
    customVehicle: {
        name: String,
        mileage: Number,
    },
    travelers: {
        type: Number,
        default: 1,
    },
    tripType: {
        type: String,
        enum: ['one-way', 'round-trip'],
        default: 'one-way',
    },
    status: {
        type: String,
        enum: ['planned', 'active', 'completed', 'cancelled'],
        default: 'planned',
    },
    stops: [{
        location: {
            lat: Number,
            lng: Number,
        },
        name: String, // Added name for easier UI display if needed
        stopover: { type: Boolean, default: true }
    }],
}, {
    timestamps: true,
});

const Trip = mongoose.model('Trip', tripSchema);

export default Trip;
