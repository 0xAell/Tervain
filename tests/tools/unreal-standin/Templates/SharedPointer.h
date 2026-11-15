// Stand-in for TSharedPtr and TSharedRef.
#pragma once

#include "CoreMinimal.h"

#include <memory>

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
