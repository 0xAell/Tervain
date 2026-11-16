// Stand-in for TArray.
#pragma once

#include "CoreMinimal.h"

#include <vector>

/** A dynamic array, over std::vector. */
template <typename T> class TArray
{
public:
	int32 Num() const { return static_cast<int32>(Items.size()); }
	T& operator[](int32 Index) { return Items[static_cast<size_t>(Index)]; }
	const T& operator[](int32 Index) const { return Items[static_cast<size_t>(Index)]; }
	int32 Add(const T& Item) { Items.push_back(Item); return Num() - 1; }
	void StandInClear() { Items.clear(); }
private:
	std::vector<T> Items;
};
