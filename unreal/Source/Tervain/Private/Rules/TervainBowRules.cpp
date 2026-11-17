#include "Rules/TervainBowRules.h"

#include "Math/UnrealMathUtility.h"

namespace
{
	/** Straight at the target: the offset made a unit vector (a zero offset is left as it is). */
	FVector Straight(double Dx, double Dy, double Dz)
	{
		const double Length = FMath::Sqrt(Dx * Dx + Dy * Dy + Dz * Dz);
		const double D = Length > 0.0 ? Length : 1.0;
		return FVector(Dx / D, Dy / D, Dz / D);
	}
}

FVector TervainRules::ArrowLaunchDirection(const FTervainBowTuning& Tuning, const FVector& Offset)
{
	const double Dx = Offset.X, Dy = Offset.Y, Dz = Offset.Z;
	const double Horizontal = FMath::Sqrt(Dx * Dx + Dz * Dz);
	if (Horizontal < 0.01) return Straight(Dx, Dy, Dz);
	const double Speed = Tuning.ArrowSpeed, Gravity = Tuning.Gravity;
	const double SpeedSquared = Speed * Speed;
	const double Discriminant = SpeedSquared * SpeedSquared - Gravity * (Gravity * Horizontal * Horizontal + 2.0 * Dy * SpeedSquared);
	if (Discriminant < 0.0) return Straight(Dx, Dy, Dz);
	const double Tangent = (SpeedSquared - FMath::Sqrt(Discriminant)) / (Gravity * Horizontal);
	const double Cosine = 1.0 / FMath::Sqrt(1.0 + Tangent * Tangent);
	return FVector(Dx / Horizontal * Cosine, Tangent * Cosine, Dz / Horizontal * Cosine);
}
