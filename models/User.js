const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
    {
        name: { type: String, required: [true, "Name is required"], trim: true },
        email: {
            type: String,
            required: [true, "Email is required"],
            unique: true,
            lowercase: true,
            trim: true,
            match: [/^\S+@\S+\.\S+$/, "Invalid email"],
        },
        password: { type: String, required: [true, "Password is required"], minlength: 6, select: false },
        role: { type: String, enum: ["user", "officer", "admin"], default: "user" },
        organization: { type: String, trim: true, default: "" },
        bio: { type: String, maxlength: 500, default: "" },
        profileImage: { type: String, default: null },
        contributionScore: { type: Number, default: 0 },
        roleUpgradeRequest: { type: Boolean, default: false },
        roleUpgradeReason: { type: String, default: "" },
        isActive: { type: Boolean, default: true },
        resetToken: { type: String, select: false },
        resetTokenExpiry: { type: Date, select: false },
    },
    { timestamps: true }
);

userSchema.pre("save", async function () {
    if (!this.isModified("password")) return;
    this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.matchPassword = async function (entered) {
    return bcrypt.compare(entered, this.password);
};

userSchema.methods.toJSON = function () {
    const obj = this.toObject();
    delete obj.password;
    delete obj.resetToken;
    delete obj.resetTokenExpiry;
    return obj;
};

module.exports = mongoose.model("User", userSchema);
