// Stand-in for FSoftObjectPath: a path to an asset, which a test fills by putting an object where the path can find it.
#pragma once

#include "UObject/Object.h"
#include "UObject/ObjectMacros.h"

#include <map>
#include <string>

struct FUObjectSerializeContext;

namespace StandIn
{
	/** Objects a test has put where a soft path can find them. */
	inline std::map<std::wstring, UObject*>& Objects() { static std::map<std::wstring, UObject*> Registry; return Registry; }
}

class FSoftObjectPath
{
public:
	FSoftObjectPath() = default;
	FSoftObjectPath(const TCHAR* Path) : Value(Path ? Path : L"") {}
	bool IsNull() const { return Value.empty(); }
	/**
	 * The object at the path, loaded if need be; null when there is none. The signature is the one Epic's API reference
	 * gives for UE 5.8, with no default arguments, since the reference prints none.
	 */
	UObject* TryLoad(FUObjectSerializeContext* InLoadContext, ELoadFlags LoadFlags) const
	{
		(void)InLoadContext; (void)LoadFlags;
		const auto Found = StandIn::Objects().find(Value);
		return Found == StandIn::Objects().end() ? nullptr : Found->second;
	}
private:
	std::wstring Value;
};
