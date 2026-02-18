/**
 * RTObject - Represents a tracked rigid body from QTM
 * 
 * Contains position (x, y, z) in millimeters
 * and rotation (x, y, z) in degrees (Euler angles: roll, pitch, yaw)
 */
class RTObject {
  constructor(name, position = null, rotation = null) {
    this.name = name;
    this.position = position; // { x, y, z } in mm, or null if not tracked
    this.rotation = rotation; // { x, y, z } in degrees (roll, pitch, yaw), or null if not tracked
  }

  /**
   * Check if this object is currently being tracked
   */
  get isTracked() {
    return this.position !== null && this.rotation !== null;
  }

  /**
   * Convert to plain object for JSON serialization
   */
  toJSON() {
    return {
      name: this.name,
      isTracked: this.isTracked,
      position: this.position,
      rotation: this.rotation
    };
  }
}

module.exports = RTObject;
