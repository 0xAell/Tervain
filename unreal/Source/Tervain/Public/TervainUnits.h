#pragma once

#include "CoreMinimal.h"
#include "Math/Rotator.h"
#include "Math/UnrealMathUtility.h"
#include "Math/Vector.h"

/**
 * Conversions between the game's core units and Unreal's.
 *
 * The core (src/core in this repository, and the JSON under data/game and data/world) uses metres and radians in a
 * right-handed frame: x east, y up, z south. A yaw of 0 faces +z and the front direction of a yaw is (sin, cos).
 * Unreal uses centimetres and degrees in a left-handed frame: X east, Y south, Z up, with yaw 0 facing +X and turning
 * towards +Y. The tables under data/unreal are already converted; use these for anything read from the core's files.
 */
namespace TervainUnits
{
	inline constexpr double CentimetresPerMetre = 100.0;

	/** A core position (x east, y up, z south, metres) as an Unreal location (cm). */
	inline FVector CoreToUnreal(double X, double Y, double Z)
	{
		return FVector(X * CentimetresPerMetre, Z * CentimetresPerMetre, Y * CentimetresPerMetre);
	}

	/** A core ground position (x east, z south, metres) with a height in metres. */
	inline FVector CoreGroundToUnreal(double X, double Z, double HeightMetres)
	{
		return CoreToUnreal(X, HeightMetres, Z);
	}

	/** An Unreal location (cm) as a core position (metres): x east, y up, z south. */
	inline FVector UnrealToCore(const FVector& Location)
	{
		return FVector(Location.X / CentimetresPerMetre, Location.Z / CentimetresPerMetre, Location.Y / CentimetresPerMetre);
	}

	/** A core yaw (radians) as an Unreal yaw (degrees) for an actor or asset whose forward is +X. */
	inline float CoreYawToUnreal(float YawRadians)
	{
		return FRotator3f::NormalizeAxis(90.f - FMath::RadiansToDegrees(YawRadians));
	}

	/** A core yaw (radians) as an Unreal yaw (degrees) for a mesh imported from glTF, whose front (+z) arrives as +Y. */
	inline float CoreYawToUnrealForImportedGltf(float YawRadians)
	{
		return FRotator3f::NormalizeAxis(-FMath::RadiansToDegrees(YawRadians));
	}

	/** An Unreal yaw (degrees, forward +X) as a core yaw (radians). */
	inline float UnrealYawToCore(float YawDegrees)
	{
		return FMath::DegreesToRadians(90.f - YawDegrees);
	}

	/** A core length in metres as centimetres. */
	inline float MetresToUnreal(float Metres)
	{
		return Metres * static_cast<float>(CentimetresPerMetre);
	}
}
