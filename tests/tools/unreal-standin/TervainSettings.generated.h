// Stand-in for the header the engine generates beside TervainSettings.h: it names the class it derives from.
#pragma once
#undef GENERATED_BODY
#define GENERATED_BODY() public: typedef UDeveloperSettings Super; private:
