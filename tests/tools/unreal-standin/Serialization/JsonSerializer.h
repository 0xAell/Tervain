// Stand-in for FJsonSerializer::Deserialize: a small strict JSON parser that keeps objects and numbers.
#pragma once

#include "Dom/JsonObject.h"
#include "Serialization/JsonReader.h"

#include <cstdlib>

class FJsonSerializer
{
public:
	/** Read a JSON object from the reader's text. False, with OutObject untouched, when the text is not one JSON object. */
	static bool Deserialize(const TSharedRef<TJsonReader<>>& Reader, TSharedPtr<FJsonObject>& OutObject)
	{
		const std::string& Text = Reader->Text;
		size_t At = 0;
		std::shared_ptr<FJsonObject> Root = std::make_shared<FJsonObject>();
		if (!Object(Text, At, *Root)) return false;
		Space(Text, At);
		if (At != Text.size()) return false;
		OutObject = TSharedPtr<FJsonObject>(Root);
		return true;
	}

private:
	static void Space(const std::string& Text, size_t& At) { while (At < Text.size() && (Text[At] == ' ' || Text[At] == '\n' || Text[At] == '\r' || Text[At] == '\t')) ++At; }
	static bool Literal(const std::string& Text, size_t& At, const char* Word)
	{
		const std::string Expected(Word);
		if (Text.compare(At, Expected.size(), Expected) != 0) return false;
		At += Expected.size();
		return true;
	}
	static bool String(const std::string& Text, size_t& At, std::string& Out)
	{
		if (At >= Text.size() || Text[At] != '"') return false;
		for (++At; At < Text.size(); ++At)
		{
			const char Character = Text[At];
			if (Character == '"') { ++At; return true; }
			if (Character == '\\')
			{
				if (++At >= Text.size()) return false;
				const char Escaped = Text[At];
				if (Escaped == 'u') { if (At + 4 >= Text.size()) return false; At += 4; Out += '?'; }
				else Out += Escaped == 'n' ? '\n' : Escaped == 't' ? '\t' : Escaped == 'r' ? '\r' : Escaped == 'b' ? '\b' : Escaped == 'f' ? '\f' : Escaped;
			}
			else Out += Character;
		}
		return false;
	}
	static bool Number(const std::string& Text, size_t& At, double& Out)
	{
		const char* Start = Text.c_str() + At;
		char* End = nullptr;
		Out = std::strtod(Start, &End);
		if (End == Start) return false;
		At += static_cast<size_t>(End - Start);
		return true;
	}
	/** Any value; an object or a number is handed back, anything else is read past. */
	static bool Value(const std::string& Text, size_t& At, std::shared_ptr<FJsonObject>& OutObject, double& OutNumber, bool& bIsNumber)
	{
		Space(Text, At);
		bIsNumber = false;
		if (At >= Text.size()) return false;
		const char Character = Text[At];
		if (Character == '{') { OutObject = std::make_shared<FJsonObject>(); return Object(Text, At, *OutObject); }
		if (Character == '[')
		{
			++At; Space(Text, At);
			if (At < Text.size() && Text[At] == ']') { ++At; return true; }
			for (;;)
			{
				std::shared_ptr<FJsonObject> Ignored; double IgnoredNumber = 0; bool bIgnored = false;
				if (!Value(Text, At, Ignored, IgnoredNumber, bIgnored)) return false;
				Space(Text, At);
				if (At < Text.size() && Text[At] == ',') { ++At; continue; }
				if (At < Text.size() && Text[At] == ']') { ++At; return true; }
				return false;
			}
		}
		if (Character == '"') { std::string Ignored; return String(Text, At, Ignored); }
		if (Character == 't') return Literal(Text, At, "true");
		if (Character == 'f') return Literal(Text, At, "false");
		if (Character == 'n') return Literal(Text, At, "null");
		bIsNumber = Number(Text, At, OutNumber);
		return bIsNumber;
	}
	static bool Object(const std::string& Text, size_t& At, FJsonObject& Out)
	{
		Space(Text, At);
		if (At >= Text.size() || Text[At] != '{') return false;
		++At; Space(Text, At);
		if (At < Text.size() && Text[At] == '}') { ++At; return true; }
		for (;;)
		{
			Space(Text, At);
			std::string Key;
			if (!String(Text, At, Key)) return false;
			Space(Text, At);
			if (At >= Text.size() || Text[At] != ':') return false;
			++At;
			std::shared_ptr<FJsonObject> Child; double NumberValue = 0; bool bIsNumber = false;
			if (!Value(Text, At, Child, NumberValue, bIsNumber)) return false;
			if (Child) Out.Objects[Key] = TSharedPtr<FJsonObject>(Child);
			else if (bIsNumber) Out.Numbers[Key] = NumberValue;
			Space(Text, At);
			if (At < Text.size() && Text[At] == ',') { ++At; continue; }
			if (At < Text.size() && Text[At] == '}') { ++At; return true; }
			return false;
		}
	}
};
