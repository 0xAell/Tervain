// Stand-ins for the object system names the seed uses: UObject, FSoftObjectPath, Cast and GetDefault. In the engine
// these arrive through the headers of the object and engine modules; here every stand-in header that needs them
// includes this file.
#pragma once

#include "CoreMinimal.h"

class UObject
{
public:
	virtual ~UObject() = default;
};

namespace StandIn
{
	/** Objects a test has put where a soft path can find them. */
	inline std::map<std::string, UObject*>& Objects() { static std::map<std::string, UObject*> Registry; return Registry; }
	/** The one default object of a settings class, which a test may change. */
	template <typename T> T* MutableDefault() { static T Object; return &Object; }
}

template <typename T> const T* GetDefault() { return StandIn::MutableDefault<T>(); }
template <typename To, typename From> To* Cast(From* Object) { return dynamic_cast<To*>(Object); }

class FSoftObjectPath
{
public:
	FSoftObjectPath() = default;
	FSoftObjectPath(const TCHAR* Path) : Value(Path ? Path : "") {}
	bool IsNull() const { return Value.empty(); }
	/** The object at the path, loaded if need be; null when there is none. */
	UObject* TryLoad() const
	{
		const auto Found = StandIn::Objects().find(Value);
		return Found == StandIn::Objects().end() ? nullptr : Found->second;
	}
private:
	std::string Value;
};
