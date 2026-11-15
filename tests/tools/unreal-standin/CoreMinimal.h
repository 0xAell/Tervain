// Stand-ins for the engine names used by the Unreal seed (unreal/Source/Tervain), so that its C++ can be compiled,
// linked and run by this repository's tests without Unreal Engine. This is not engine code and not part of the seed.
// Each definition follows the behaviour Epic documents for the name it stands in for, as far as the seed uses it; the
// signatures are written from the engine's public API as the seed's author understood it, and only a build in the
// engine itself can confirm them.
#pragma once

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <map>
#include <memory>
#include <string>
#include <vector>

using uint8 = std::uint8_t;
using int32 = std::int32_t;
using TCHAR = char;
#define TEXT(Literal) Literal

// Reflection markup: the engine's header tool reads these; a plain compiler sees nothing. Each stand-in
// `*.generated.h` redefines GENERATED_BODY for the classes of its header, as the engine's generated headers do.
#define USTRUCT(...)
#define UCLASS(...)
#define UENUM(...)
#define UPROPERTY(...)
#define UFUNCTION(...)
#define GENERATED_BODY()
#define TERVAIN_API

struct FMath
{
	template <typename T> static T Max(T A, T B) { return A > B ? A : B; }
	template <typename T> static T Min(T A, T B) { return A < B ? A : B; }
	/** "Converts a float to the nearest integer. Rounds up when the fraction is .5". */
	static int32 RoundToInt(float F) { return static_cast<int32>(std::floor(F + 0.5f)); }
	static float RadiansToDegrees(float Radians) { return Radians * (180.f / 3.14159265358979323846f); }
	static float DegreesToRadians(float Degrees) { return Degrees * (3.14159265358979323846f / 180.f); }
};

/** Double-precision vector, as FVector is since Unreal Engine 5. */
struct FVector
{
	double X = 0, Y = 0, Z = 0;
	FVector() = default;
	FVector(double InX, double InY, double InZ) : X(InX), Y(InY), Z(InZ) {}
	static const FVector ZeroVector;
};
inline const FVector FVector::ZeroVector{};

struct FRotator3f
{
	/** An angle in the range [0, 360). */
	static float ClampAxis(float Angle)
	{
		Angle = std::fmod(Angle, 360.f);
		return Angle < 0.f ? Angle + 360.f : Angle;
	}
	/** An angle in the range (-180, 180]. */
	static float NormalizeAxis(float Angle)
	{
		Angle = ClampAxis(Angle);
		return Angle > 180.f ? Angle - 360.f : Angle;
	}
};

/** A dynamic array, over std::vector. */
template <typename T> class TArray
{
public:
	int32 Num() const { return static_cast<int32>(Items.size()); }
	T& operator[](int32 Index) { return Items[static_cast<size_t>(Index)]; }
	const T& operator[](int32 Index) const { return Items[static_cast<size_t>(Index)]; }
	int32 Add(const T& Item) { Items.push_back(Item); return Num() - 1; }
	void Reset() { Items.clear(); }
private:
	std::vector<T> Items;
};

/** A string, over std::string; `*String` gives its characters, as in the engine. */
class FString
{
public:
	FString() = default;
	FString(const TCHAR* Characters) : Value(Characters ? Characters : "") {}
	FString(const std::string& InValue) : Value(InValue) {}
	const TCHAR* operator*() const { return Value.c_str(); }
	bool operator==(const FString& Other) const { return Value == Other.Value; }
	bool IsEmpty() const { return Value.empty(); }
	/** Split at each occurrence of a delimiter; with InCullEmpty, empty pieces are dropped. Returns the count. */
	int32 ParseIntoArray(TArray<FString>& OutArray, const TCHAR* Delimiter, bool InCullEmpty = true) const
	{
		OutArray.Reset();
		const std::string Separator(Delimiter);
		size_t Start = 0;
		for (;;)
		{
			const size_t End = Value.find(Separator, Start);
			const std::string Piece = Value.substr(Start, End == std::string::npos ? std::string::npos : End - Start);
			if (!Piece.empty() || !InCullEmpty) OutArray.Add(FString(Piece));
			if (End == std::string::npos) break;
			Start = End + Separator.size();
		}
		return OutArray.Num();
	}
	const std::string& StandInValue() const { return Value; }
private:
	std::string Value;
};

/** A name, over std::string. */
class FName
{
public:
	FName() = default;
	FName(const TCHAR* Characters) : Value(Characters ? Characters : "") {}
	bool operator==(const FName& Other) const { return Value == Other.Value; }
	const std::string& StandInValue() const { return Value; }
private:
	std::string Value;
};

/** Shared pointers, over std::shared_ptr. A TSharedRef is never null. */
template <typename T> class TSharedPtr
{
public:
	TSharedPtr() = default;
	TSharedPtr(std::shared_ptr<T> InPointer) : Pointer(std::move(InPointer)) {}
	bool IsValid() const { return Pointer != nullptr; }
	void Reset() { Pointer.reset(); }
	T* operator->() const { return Pointer.get(); }
	T& operator*() const { return *Pointer; }
	T* Get() const { return Pointer.get(); }
private:
	std::shared_ptr<T> Pointer;
};
template <typename T> class TSharedRef
{
public:
	explicit TSharedRef(std::shared_ptr<T> InPointer) : Pointer(std::move(InPointer)) {}
	T* operator->() const { return Pointer.get(); }
	T& operator*() const { return *Pointer; }
private:
	std::shared_ptr<T> Pointer;
};
